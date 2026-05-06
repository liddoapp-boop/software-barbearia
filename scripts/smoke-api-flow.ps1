param(
  [string]$BaseUrl = $env:SMOKE_BASE_URL,
  [string]$UnitId = $env:SMOKE_UNIT_ID,
  [string]$OwnerEmail = $env:SMOKE_OWNER_EMAIL,
  [string]$OwnerPassword = $env:SMOKE_OWNER_PASSWORD
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = "http://127.0.0.1:3333"
}
if ([string]::IsNullOrWhiteSpace($UnitId)) {
  $UnitId = "unit-01"
}
if ([string]::IsNullOrWhiteSpace($OwnerEmail)) {
  $OwnerEmail = "owner@barbearia.local"
}
if ([string]::IsNullOrWhiteSpace($OwnerPassword)) {
  $OwnerPassword = "owner123"
}

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Assert($condition, $message) {
  if (-not $condition) {
    throw "ASSERT FAILED: $message"
  }
}

function Invoke-StatusCode([string]$uri, [hashtable]$headers = $null) {
  try {
    Invoke-WebRequest -UseBasicParsing -Method Get -Uri $uri -Headers $headers -TimeoutSec 10 | Out-Null
    return 200
  } catch {
    try {
      return [int]$_.Exception.Response.StatusCode
    } catch {
      throw
    }
  }
}

function Test-ApiHealthy($url) {
  try {
    $response = Invoke-RestMethod -Method Get -Uri "$url/health" -TimeoutSec 2
    return ($response.ok -eq $true)
  } catch {
    return $false
  }
}

function Test-ApiSupportsManagementReports($url) {
  $probeUrl = "$url/reports/management/summary?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z"
  try {
    Invoke-WebRequest -Method Get -Uri $probeUrl -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    $statusCode = $null
    try {
      $statusCode = [int]$_.Exception.Response.StatusCode
    } catch {
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
      return $true
    }
    return $false
  }
}

function Test-PortInUse($port) {
  try {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
    return ($null -ne $listener)
  } catch {
    return $false
  }
}

function Get-PortOwnerPids($port) {
  try {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    return @()
  }
}

function Stop-NodeListenersOnPort($port) {
  $stopped = $false
  $ownerPids = Get-PortOwnerPids $port
  foreach ($ownerPid in $ownerPids) {
    try {
      $ownerProcess = Get-Process -Id $ownerPid -ErrorAction Stop
      $name = $ownerProcess.ProcessName.ToLowerInvariant()
      if ($name -eq "node" -or $name -eq "npm" -or $name -eq "npx") {
        Stop-Process -Id $ownerPid -Force -ErrorAction Stop
        $stopped = $true
      }
    } catch {
    }
  }
  return $stopped
}

function Ensure-ApiReady($projectRoot, $url) {
  if (Test-ApiHealthy $url) {
    if (Test-ApiSupportsManagementReports $url) {
      return @{
        startedByScript = $false
        process = $null
        listenerPid = $null
        outLog = $null
        errLog = $null
      }
    }

    $port = ([System.Uri]$url).Port
    Step "API saudavel em $url, mas sem contrato /reports/management. Reiniciando listener Node da porta $port"
    if (-not (Stop-NodeListenersOnPort $port)) {
      throw "A API em $url respondeu /health, mas nao expoe /reports/management/summary. Informe SMOKE_BASE_URL de uma API atual ou libere a porta $port."
    }
    Start-Sleep -Seconds 1
  }

  $port = ([System.Uri]$url).Port
  if (Test-PortInUse $port) {
    Step "Porta $port em uso. Aguardando API responder /health"
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-ApiHealthy $url) {
        return @{
          startedByScript = $false
          process = $null
          listenerPid = $null
          outLog = $null
          errLog = $null
        }
      }
    }

    Step "Porta $port continua ocupada sem health. Tentando liberar processo Node"
    Stop-NodeListenersOnPort $port | Out-Null

    Start-Sleep -Seconds 1
    if (Test-PortInUse $port) {
      throw "Porta $port ocupada por processo externo e sem health. Libere a porta e tente novamente."
    }
  }

  Step "API offline. Iniciando servidor local para o smoke"
  $stamp = [Guid]::NewGuid().ToString("N")
  $outLog = Join-Path $env:TEMP "smoke-api-$stamp-out.log"
  $errLog = Join-Path $env:TEMP "smoke-api-$stamp-err.log"
  $previousPort = $env:PORT
  $env:PORT = [string]$port
  try {
    $process = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:api" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  } finally {
    $env:PORT = $previousPort
  }

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ApiHealthy $url) {
      $listenerPid = $null
      $listenerOwners = Get-PortOwnerPids $port
      if ($listenerOwners.Count -gt 0) {
        $listenerPid = $listenerOwners[0]
      }
      return @{
        startedByScript = $true
        process = $process
        listenerPid = $listenerPid
        outLog = $outLog
        errLog = $errLog
      }
    }
  }

  $lastOutput = ""
  if (Test-Path $errLog) {
    $lastOutput += (Get-Content $errLog -Tail 20 | Out-String)
  }
  if (-not [string]::IsNullOrWhiteSpace($lastOutput)) {
    throw "API nao ficou pronta para smoke. Ultimos logs:`n$lastOutput"
  }

  throw "API nao ficou pronta para smoke dentro do tempo esperado."
}

$baseUrl = $BaseUrl.TrimEnd("/")
$unitId = $UnitId
$correlationId = [Guid]::NewGuid().ToString()
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$apiRuntime = $null

try {
  $apiRuntime = Ensure-ApiReady $projectRoot $baseUrl

  Step "Verificando health da API"
  $health = Invoke-RestMethod -Method Get -Uri "$baseUrl/health"
  Assert ($health.ok -eq $true) "Health check nao retornou ok=true"

  Step "Autenticando sessao"
  $loginPayload = @{
    email = $OwnerEmail
    password = $OwnerPassword
    activeUnitId = $unitId
  } | ConvertTo-Json

  $login = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/login" -ContentType "application/json" -Body $loginPayload
  Assert ($null -ne $login.accessToken) "Login nao retornou accessToken"

  $headers = @{
    Authorization = "Bearer $($login.accessToken)"
    "x-correlation-id" = $correlationId
  }

  Step "Validando permissoes basicas (401 sem token e 403 cross-unit)"
  $dashboardDate = (Get-Date).ToUniversalTime().ToString("o")
  $unauthenticatedStatus = Invoke-StatusCode "$baseUrl/dashboard?unitId=$unitId&date=$dashboardDate"
  Assert ($unauthenticatedStatus -eq 401) "Esperado 401 sem token em rota protegida"

  $crossUnitStatus = Invoke-StatusCode "$baseUrl/dashboard?unitId=unit-02&date=$dashboardDate" $headers
  Assert ($crossUnitStatus -eq 403) "Esperado 403 para tentativa cross-unit"

  Step "Lendo catalogo"
  $catalog = Invoke-RestMethod -Method Get -Uri "$baseUrl/catalog" -Headers $headers

  $clientId = $catalog.clients[0].id
  $professionalId = $catalog.professionals[0].id
  $serviceId = $catalog.services[0].id
  $servicePrice = [double]$catalog.services[0].price
  if ($servicePrice -le 0 -and $null -ne $catalog.services[0].salePrice) {
    $servicePrice = [double]$catalog.services[0].salePrice
  }
  $availableProduct = @($catalog.products | Where-Object { [double]$_.stockQty -gt 0 } | Select-Object -First 1)

  Assert ($null -ne $clientId) "Catalogo sem cliente"
  Assert ($null -ne $professionalId) "Catalogo sem profissional"
  Assert ($null -ne $serviceId) "Catalogo sem servico"
  Assert ($availableProduct.Count -gt 0) "Catalogo sem produto com estoque para venda/devolucao"
  $productId = $availableProduct[0].id

  $now = Get-Date
  $slotFound = $false
  $attempt = 0
  $created = $null
  $appointmentId = $null

  Step "Criando agendamento"
  while (-not $slotFound -and $attempt -lt 12) {
    $startsAt = $now.AddMinutes(30 + (60 * $attempt)).ToUniversalTime().ToString("o")
    $createPayload = @{
      unitId = $unitId
      clientId = $clientId
      professionalId = $professionalId
      serviceId = $serviceId
      startsAt = $startsAt
      changedBy = "smoke-test@owner"
    } | ConvertTo-Json

    try {
      $created = Invoke-RestMethod -Method Post -Uri "$baseUrl/appointments" -Headers $headers -ContentType "application/json" -Body $createPayload
      $appointmentId = $created.appointment.id
      $slotFound = $true
    } catch {
      $attempt++
    }
  }

  Assert ($slotFound -eq $true) "Nao encontrou horario livre para teste de smoke"
  Assert ($null -ne $appointmentId) "Agendamento nao retornou id"

  Step "Confirmando atendimento"
  $confirmPayload = @{
    status = "CONFIRMED"
    changedBy = "smoke-test@owner"
  } | ConvertTo-Json

  $confirmed = Invoke-RestMethod -Method Patch -Uri "$baseUrl/appointments/$appointmentId/status" -Headers $headers -ContentType "application/json" -Body $confirmPayload
  Assert ($confirmed.appointment.status -eq "CONFIRMED") "Status esperado CONFIRMED"

  Step "Iniciando atendimento"
  $startPayload = @{
    status = "IN_SERVICE"
    changedBy = "smoke-test@owner"
  } | ConvertTo-Json

  $started = Invoke-RestMethod -Method Patch -Uri "$baseUrl/appointments/$appointmentId/status" -Headers $headers -ContentType "application/json" -Body $startPayload
  Assert ($started.appointment.status -eq "IN_SERVICE") "Status esperado IN_SERVICE"

  Step "Finalizando atendimento via checkout"
  $createdStartsAt = [DateTime]$created.appointment.startsAt
  $completedAt = $createdStartsAt.AddMinutes(45).ToUniversalTime().ToString("o")
  if ($null -ne $created.appointment.servicePrice -and [double]$created.appointment.servicePrice -gt 0) {
    $servicePrice = [double]$created.appointment.servicePrice
  }
  $checkoutPayload = @{
    idempotencyKey = "smoke-checkout-$correlationId"
    changedBy = "smoke-test@owner"
    completedAt = $completedAt
    paymentMethod = "PIX"
    expectedTotal = $servicePrice
    notes = "Smoke operacional via checkout"
    products = @()
  } | ConvertTo-Json -Depth 8

  $checkout = Invoke-RestMethod -Method Post -Uri "$baseUrl/appointments/$appointmentId/checkout" -Headers $headers -ContentType "application/json" -Body $checkoutPayload
  Assert ($checkout.appointment.status -eq "COMPLETED") "Status esperado COMPLETED"
  Assert ([double]$checkout.serviceRevenue.amount -gt 0) "Receita do atendimento nao foi gerada no checkout"

  Step "Registrando venda de produto"
  $soldAt = (Get-Date).ToUniversalTime().ToString("o")
  $salePayload = @{
    idempotencyKey = "smoke-product-sale-$correlationId"
    unitId = $unitId
    clientId = $clientId
    professionalId = $professionalId
    soldAt = $soldAt
    items = @(
      @{
        productId = $productId
        quantity = 1
      }
    )
  } | ConvertTo-Json -Depth 8

  $sale = Invoke-RestMethod -Method Post -Uri "$baseUrl/sales/products" -Headers $headers -ContentType "application/json" -Body $salePayload
  Assert ($null -ne $sale.sale.id) "Venda de produto nao retornou id"
  Assert ([double]$sale.revenue.amount -gt 0) "Receita de produto nao foi gerada"

  Step "Consultando historico de vendas"
  $historyStart = (Get-Date).AddDays(-1).ToUniversalTime().ToString("o")
  $historyEnd = (Get-Date).AddDays(1).ToUniversalTime().ToString("o")
  $salesHistory = Invoke-RestMethod -Method Get -Uri "$baseUrl/sales/products?unitId=$unitId&start=$historyStart&end=$historyEnd&search=$($sale.sale.id)&limit=20" -Headers $headers
  Assert ($salesHistory.sales.Count -ge 1) "Historico de vendas nao retornou a venda criada"

  Step "Devolvendo produto vendido"
  $refundPayload = @{
    idempotencyKey = "smoke-product-refund-$correlationId"
    unitId = $unitId
    changedBy = "smoke-test@owner"
    reason = "Smoke de devolucao operacional"
    refundedAt = (Get-Date).ToUniversalTime().ToString("o")
    items = @(
      @{
        productId = $productId
        quantity = 1
      }
    )
  } | ConvertTo-Json -Depth 8

  $refund = Invoke-RestMethod -Method Post -Uri "$baseUrl/sales/products/$($sale.sale.id)/refund" -Headers $headers -ContentType "application/json" -Body $refundPayload
  Assert ($null -ne $refund.refund.id) "Devolucao nao retornou refund id"
  Assert ([double]$refund.financialEntry.amount -gt 0) "Devolucao nao gerou lancamento financeiro reverso"

  Step "Consultando financeiro"
  $financial = Invoke-RestMethod -Method Get -Uri "$baseUrl/financial/transactions?unitId=$unitId&start=$historyStart&end=$historyEnd&limit=50" -Headers $headers
  Assert ($financial.transactions.Count -ge 3) "Financeiro nao retornou movimentacoes do smoke"

  Step "Consultando resumo de relatorios gerenciais"
  $reportsSummary = Invoke-RestMethod -Method Get -Uri "$baseUrl/reports/management/summary?unitId=$unitId&start=$historyStart&end=$historyEnd" -Headers $headers
  Assert ($reportsSummary.reports.Count -ge 5) "Resumo de relatorios nao retornou cards gerenciais"

  Step "Consultando relatorio financeiro gerencial"
  $managementFinancial = Invoke-RestMethod -Method Get -Uri "$baseUrl/reports/management/financial?unitId=$unitId&start=$historyStart&end=$historyEnd&limit=50" -Headers $headers
  Assert ([double]$managementFinancial.summary.totalIncome -gt 0) "Relatorio financeiro gerencial nao retornou entradas"

  Step "Consultando relatorio de vendas gerencial"
  $managementProductSales = Invoke-RestMethod -Method Get -Uri "$baseUrl/reports/management/product-sales?unitId=$unitId&start=$historyStart&end=$historyEnd&limit=50" -Headers $headers
  Assert ([int]$managementProductSales.summary.salesCount -ge 1) "Relatorio gerencial de vendas nao retornou vendas"

  Step "Consultando relatorio de estoque gerencial"
  $managementStock = Invoke-RestMethod -Method Get -Uri "$baseUrl/reports/management/stock?unitId=$unitId&start=$historyStart&end=$historyEnd&limit=50" -Headers $headers
  Assert ($managementStock.movements.Count -ge 1) "Relatorio gerencial de estoque nao retornou movimentacoes"

  Step "Exportando CSV gerencial simples"
  $csvResponse = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$baseUrl/reports/management/export.csv?unitId=$unitId&start=$historyStart&end=$historyEnd&type=financial" -Headers $headers
  Assert ($csvResponse.Headers["Content-Type"] -like "text/csv*") "CSV gerencial nao retornou Content-Type text/csv"
  Assert ($csvResponse.Content -like "*Origem*") "CSV gerencial nao retornou cabecalho humano"

  Step "Exportando CSV gerencial de clientes"
  $clientsCsvResponse = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$baseUrl/reports/management/export.csv?unitId=$unitId&start=$historyStart&end=$historyEnd&type=clients" -Headers $headers
  Assert ($clientsCsvResponse.Headers["Content-Type"] -like "text/csv*") "CSV gerencial de clientes nao retornou Content-Type text/csv"
  Assert ($clientsCsvResponse.Content -like "*Cliente*") "CSV gerencial de clientes nao retornou cabecalho humano"
  Assert ($clientsCsvResponse.Content -notlike "*clientId*") "CSV gerencial de clientes expos clientId"

  Step "Consultando comissoes"
  $commissions = Invoke-RestMethod -Method Get -Uri "$baseUrl/financial/commissions?unitId=$unitId&start=$historyStart&end=$historyEnd&limit=50" -Headers $headers
  if ($commissions.entries.Count -gt 0) {
    Write-Host "Comissoes consultadas: $($commissions.entries.Count)"
  } else {
    Write-Host "Nenhuma comissao gerada para os dados atuais do smoke; consulta validada sem pagamento." -ForegroundColor Yellow
  }

  Step "Consultando dashboard"
  $dashboardDate = $createdStartsAt.ToUniversalTime().ToString("o")
  $dashboard = Invoke-RestMethod -Method Get -Uri "$baseUrl/dashboard?unitId=$unitId&date=$dashboardDate" -Headers $headers
  Assert ([int]$dashboard.appointmentsToday -ge 1) "Dashboard nao refletiu agendamento"
  Assert ([double]$dashboard.revenueToday -gt 0) "Dashboard nao refletiu receita do dia"

  Step "Consultando auditoria"
  $audit = Invoke-RestMethod -Method Get -Uri "$baseUrl/audit/events?unitId=$unitId&limit=20" -Headers $headers
  Assert ($null -ne $audit.events) "Auditoria nao retornou lista de eventos"
  Assert ($audit.events.Count -gt 0) "Auditoria nao retornou eventos recentes"

  Write-Host ""
  Write-Host "SMOKE TEST CONCLUIDO COM SUCESSO" -ForegroundColor Green
  Write-Host "Agendamento testado: $appointmentId"
  Write-Host "Checkout gerado: $($checkout.serviceRevenue.amount)"
  Write-Host "Venda testada: $($sale.sale.id)"
  Write-Host "Refund testado: $($refund.refund.id)"
} finally {
  if ($null -ne $apiRuntime -and $apiRuntime.startedByScript -and $null -ne $apiRuntime.process) {
    if ($apiRuntime.listenerPid) {
      Stop-Process -Id $apiRuntime.listenerPid -Force -ErrorAction SilentlyContinue
    }
    if (-not $apiRuntime.process.HasExited) {
      Step "Encerrando API iniciada pelo smoke"
      Stop-Process -Id $apiRuntime.process.Id -Force -ErrorAction SilentlyContinue
    }
    if ($apiRuntime.outLog -and (Test-Path $apiRuntime.outLog)) {
      Remove-Item $apiRuntime.outLog -Force -ErrorAction SilentlyContinue
    }
    if ($apiRuntime.errLog -and (Test-Path $apiRuntime.errLog)) {
      Remove-Item $apiRuntime.errLog -Force -ErrorAction SilentlyContinue
    }
  }
}
