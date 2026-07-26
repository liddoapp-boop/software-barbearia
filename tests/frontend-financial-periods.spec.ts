import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function loadPeriodFunctions(customStart = "", customEnd = "") {
  const app = readFileSync("public/app.js", "utf8");
  const rangeStart = app.indexOf("function rangeFromPeriod(period)");
  const rangeEnd = app.indexOf("function rangeFromReportsPeriod(period)");
  const previousStart = app.indexOf("function previousRangeFromCurrent(range)");
  const previousEnd = app.indexOf("function asDateInputValue(date = new Date())");
  const source = [
    app.slice(rangeStart, rangeEnd),
    app.slice(previousStart, previousEnd),
    "module.exports = { rangeFromPeriod, previousRangeFromCurrent };",
  ].join("\n");
  const context = {
    Date,
    Number,
    financialCustomStart: { value: customStart },
    financialCustomEnd: { value: customEnd },
    module: { exports: {} as Record<string, any> },
  };
  vm.runInNewContext(source, context, { filename: "public/app.js:financial-periods" });
  return context.module.exports as {
    rangeFromPeriod: (period: string) => { start: Date; end: Date };
    previousRangeFromCurrent: (range: { start: Date; end: Date }) => {
      compareStart: Date;
      compareEnd: Date;
    };
  };
}

function localDateParts(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ];
}

describe("períodos financeiros", () => {
  const originalTimezone = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T15:00:00-03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimezone;
  });

  it.each([
    ["today", [2026, 7, 26, 0, 0, 0, 0], [2026, 7, 26, 23, 59, 59, 999]],
    ["week", [2026, 7, 20, 0, 0, 0, 0], [2026, 7, 26, 23, 59, 59, 999]],
    ["thirty_days", [2026, 6, 27, 0, 0, 0, 0], [2026, 7, 26, 23, 59, 59, 999]],
    ["month", [2026, 7, 1, 0, 0, 0, 0], [2026, 7, 31, 23, 59, 59, 999]],
    ["previous_month", [2026, 6, 1, 0, 0, 0, 0], [2026, 6, 30, 23, 59, 59, 999]],
  ])("preserva limites locais para %s", (period, expectedStart, expectedEnd) => {
    const { rangeFromPeriod } = loadPeriodFunctions();
    const range = rangeFromPeriod(period);

    expect(localDateParts(range.start)).toEqual(expectedStart);
    expect(localDateParts(range.end)).toEqual(expectedEnd);
  });

  it("preserva os limites locais do período personalizado", () => {
    const { rangeFromPeriod } = loadPeriodFunctions("2026-07-03", "2026-07-15");
    const range = rangeFromPeriod("custom");

    expect(localDateParts(range.start)).toEqual([2026, 7, 3, 0, 0, 0, 0]);
    expect(localDateParts(range.end)).toEqual([2026, 7, 15, 23, 59, 59, 999]);
    expect(range.start.toISOString()).toBe("2026-07-03T03:00:00.000Z");
  });

  it.each(["today", "week", "thirty_days", "month", "previous_month"])(
    "gera período anterior equivalente e sem sobreposição para %s",
    (period) => {
      const { rangeFromPeriod, previousRangeFromCurrent } = loadPeriodFunctions();
      const current = rangeFromPeriod(period);
      const previous = previousRangeFromCurrent(current);

      expect(previous.compareEnd.getTime()).toBe(current.start.getTime() - 1);
      expect(previous.compareEnd.getTime()).toBeLessThan(current.start.getTime());
      expect(previous.compareEnd.getTime() - previous.compareStart.getTime()).toBe(
        current.end.getTime() - current.start.getTime(),
      );
    },
  );

  it("gera período anterior equivalente e sem sobreposição no personalizado", () => {
    const { rangeFromPeriod, previousRangeFromCurrent } = loadPeriodFunctions(
      "2026-07-03",
      "2026-07-15",
    );
    const current = rangeFromPeriod("custom");
    const previous = previousRangeFromCurrent(current);

    expect(previous.compareEnd.getTime()).toBe(current.start.getTime() - 1);
    expect(previous.compareEnd.getTime() - previous.compareStart.getTime()).toBe(
      current.end.getTime() - current.start.getTime(),
    );
  });
});
