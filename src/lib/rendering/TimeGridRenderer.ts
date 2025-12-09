/**
 * TimeGridRenderer - Calculates grid line positions and labels
 *
 * Extracted from Calendar.svelte for modularity and testability.
 * Uses continuous spacing-based progressive disclosure instead of discrete LOD levels.
 */

export interface GridLine {
    /** Unique identifier for stable rendering */
    key: string;
    /** X position in pixels from left edge */
    x: number;
    /** Label text (may be empty for sub-units) */
    label: string;
    /** Whether this is a major grid line (year, decade, century) */
    isMajor: boolean;
    /** Line opacity (0-1) for fade transitions */
    opacity: number;
    /** Line height as fraction (0-1, 1 = full height) */
    lineHeight: number;
    /** Whether this is a sub-unit indicator (hour, minute) */
    isSubUnit: boolean;
    /** Variable font weight (400-700) */
    fontWeight: number;
    /** Font size in pixels (10-13) */
    fontSize: number;
    /** Optional label-specific opacity */
    labelOpacity?: number;
}

export interface ContextLabels {
    year: string;
    month: string;
    dayNum: string;
    weekday: string;
    time: string;
}

export interface TimeGridResult {
    gridLines: GridLine[];
    contextLabels: ContextLabels;
}

export interface TimeGridConfig {
    /** Left edge time in ms */
    startTime: number;
    /** Right edge time in ms */
    endTime: number;
    /** Center time in ms */
    centerTime: number;
    /** Zoom level: pixels per millisecond */
    pixelsPerMs: number;
    /** Canvas width in pixels */
    width: number;
    /** Whether device is mobile (affects left offset) */
    isMobile: boolean;
    /** Context column width (for desktop left offset) */
    contextColWidth: number;
}

// Time constants (in milliseconds)
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const MONTH_MS = 2_628_000_000; // Average month
const YEAR_MS = 31_536_000_000;
const DECADE_MS = YEAR_MS * 10;
const CENTURY_MS = YEAR_MS * 100;

// Minimum readable spacing (pixels) for each unit type
const MIN_SPACING: Record<string, number> = {
    minute: 25,
    hour: 35,
    day: 50,
    week: 45,
    month: 30,
    year: 25,
    decade: 30,
    century: 40,
};

// Unit hierarchy for line darkness (larger units = darker)
const UNIT_HIERARCHY: Record<string, number> = {
    century: 1.0,
    decade: 0.9,
    year: 0.85,
    month: 0.6,
    week: 0.5,
    day: 0.4,
    hour: 0.3,
    minute: 0.2,
};

/**
 * Calculate opacity based on spacing using fade in/out
 */
function calculateOpacity(spacing: number, required: number): number {
    const fadeStart = required * 0.4;
    const fadeEnd = required;
    if (spacing < fadeStart) return 0;
    if (spacing >= fadeEnd) return 1;
    return (spacing - fadeStart) / (fadeEnd - fadeStart);
}

/**
 * Get ISO week number for a date
 */
function getISOWeek(d: Date): number {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return (
        1 +
        Math.round(
            ((date.getTime() - week1.getTime()) / 86400000 -
                3 +
                ((week1.getDay() + 6) % 7)) /
            7,
        )
    );
}

/**
 * Calculate all grid lines and context labels for the given viewport configuration.
 * This is the main entry point for the time grid renderer.
 */
export function calculateTimeGrid(config: TimeGridConfig): TimeGridResult {
    const { startTime, endTime, centerTime, pixelsPerMs, width } = config;
    const halfWidth = width / 2;
    // Note: contextColWidth and isMobile are no longer used for culling since
    // the context card is now a floating overlay that doesn't block grid lines

    // Calculate pixel spacing for each time unit
    const spacings = {
        minute: MINUTE_MS * pixelsPerMs,
        hour: HOUR_MS * pixelsPerMs,
        day: DAY_MS * pixelsPerMs,
        week: WEEK_MS * pixelsPerMs,
        month: MONTH_MS * pixelsPerMs,
        year: YEAR_MS * pixelsPerMs,
        decade: DECADE_MS * pixelsPerMs,
        century: CENTURY_MS * pixelsPerMs,
    };

    // Context labels (for the floating card)
    const centerDate = new Date(centerTime);
    const contextLabels: ContextLabels = {
        year: centerDate.getFullYear().toString(),
        month: `${centerDate.toLocaleString("en-US", { month: "long" })} ${centerDate.getDate()}`,
        dayNum: "",
        weekday: centerDate.toLocaleString("en-US", { weekday: "long" }),
        time: centerDate.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        }),
    };

    const gridLines: GridLine[] = [];
    const MIN_LABEL_DISTANCE = 15;

    // Helper to check if a position is too close to existing lines
    const isTooClose = (screenX: number): boolean => {
        return gridLines.some((line) => Math.abs(line.x - screenX) < MIN_LABEL_DISTANCE);
    };

    // Helper to add a grid line if it passes all checks
    const addLine = (
        unitName: string,
        time: number,
        screenX: number,
        label: string,
        opacity: number,
        importance: number,
    ): void => {
        if (screenX <= 0 || screenX >= width) return;
        if (isTooClose(screenX)) return;

        const hierarchyLevel = UNIT_HIERARCHY[unitName] || 0.5;
        const isMajorLine = hierarchyLevel >= 0.85;
        const isSubLine = hierarchyLevel <= 0.4;
        const finalOpacity = opacity * (0.5 + importance * 0.5);
        const fontWeight = Math.round(400 + importance * 250);
        const fontSize = Math.round(10 + importance * 3);

        gridLines.push({
            key: `${unitName}-${time}`,
            x: screenX,
            label,
            isMajor: isMajorLine,
            opacity: finalOpacity,
            lineHeight: 1,
            isSubUnit: isSubLine,
            fontWeight,
            fontSize,
            labelOpacity: finalOpacity,
        });
    };

    // Helper to get screen X position for a time
    const timeToScreenX = (time: number): number => {
        return halfWidth + (time - centerTime) * pixelsPerMs;
    };

    // CENTURY LABELS
    if (spacings.century > MIN_SPACING.century * 0.4) {
        const opacity = calculateOpacity(spacings.century, MIN_SPACING.century);
        const startDate = new Date(startTime);
        let currentDate = new Date(Math.floor(startDate.getFullYear() / 100) * 100, 0, 1);

        while (currentDate.getTime() < endTime) {
            const time = currentDate.getTime();
            addLine("century", time, timeToScreenX(time), currentDate.getFullYear().toString(), opacity, 1.0);
            currentDate.setFullYear(currentDate.getFullYear() + 100);
        }
    }

    // DECADE LABELS - Progressive disclosure
    if (spacings.decade >= 10) {
        const decadeSpacing = spacings.decade;
        const startDate = new Date(startTime);
        let currentDate = new Date(Math.floor(startDate.getFullYear() / 10) * 10, 0, 1);

        while (currentDate.getTime() < endTime) {
            const year = currentDate.getFullYear();
            const time = currentDate.getTime();
            const screenX = timeToScreenX(time);

            // Progressive disclosure thresholds
            let requiredSpacing: number;
            let importance: number;

            if (year % 100 === 0) {
                requiredSpacing = 15;
                importance = 1.0;
            } else if (year % 50 === 0) {
                requiredSpacing = 35;
                importance = 0.7;
            } else {
                requiredSpacing = 60;
                importance = 0.4;
            }

            const fadeStart = requiredSpacing * 0.5;
            const fadeEnd = requiredSpacing;
            let decadeOpacity = 0;
            if (decadeSpacing >= fadeEnd) {
                decadeOpacity = 1;
            } else if (decadeSpacing > fadeStart) {
                decadeOpacity = (decadeSpacing - fadeStart) / (fadeEnd - fadeStart);
            }

            if (decadeOpacity > 0.01) {
                if (screenX > 0 && screenX < width && !isTooClose(screenX)) {
                    const finalOpacity = decadeOpacity * (0.5 + importance * 0.5);
                    gridLines.push({
                        key: `decade-${time}`,
                        x: screenX,
                        label: year.toString(),
                        isMajor: year % 100 === 0,
                        opacity: finalOpacity,
                        lineHeight: 1,
                        isSubUnit: false,
                        fontWeight: Math.round(400 + importance * 200),
                        fontSize: Math.round(10 + importance * 3),
                        labelOpacity: finalOpacity,
                    });
                }
            }

            currentDate.setFullYear(currentDate.getFullYear() + 10);
        }
    }

    // YEAR LABELS - Progressive disclosure
    if (spacings.year >= 10) {
        const yearSpacing = spacings.year;
        const startDate = new Date(startTime);
        let currentDate = new Date(startDate.getFullYear(), 0, 1);

        while (currentDate.getTime() < endTime) {
            const year = currentDate.getFullYear();
            const time = currentDate.getTime();
            const screenX = timeToScreenX(time);

            let requiredSpacing: number;
            let importance: number;

            if (year % 10 === 0) {
                requiredSpacing = 15;
                importance = 1.0;
            } else if (year % 5 === 0) {
                requiredSpacing = 25;
                importance = 0.7;
            } else {
                requiredSpacing = 40;
                importance = 0.4;
            }

            const fadeStart = requiredSpacing * 0.5;
            const fadeEnd = requiredSpacing;
            let yearOpacity = 0;
            if (yearSpacing >= fadeEnd) {
                yearOpacity = 1;
            } else if (yearSpacing > fadeStart) {
                yearOpacity = (yearSpacing - fadeStart) / (fadeEnd - fadeStart);
            }

            if (yearOpacity > 0.01) {
                if (screenX > 0 && screenX < width && !isTooClose(screenX)) {
                    const finalOpacity = yearOpacity * (0.5 + importance * 0.5);
                    gridLines.push({
                        key: `year-${time}`,
                        x: screenX,
                        label: year.toString(),
                        isMajor: true,
                        opacity: finalOpacity,
                        lineHeight: 1,
                        isSubUnit: false,
                        fontWeight: Math.round(400 + importance * 200),
                        fontSize: Math.round(10 + importance * 3),
                        labelOpacity: finalOpacity,
                    });
                }
            }

            currentDate.setFullYear(currentDate.getFullYear() + 1);
        }
    }

    // MONTH LABELS - Progressive disclosure
    if (spacings.month >= 8) {
        const monthSpacing = spacings.month;
        const startDate = new Date(startTime);
        let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

        while (currentDate.getTime() < endTime) {
            const month = currentDate.getMonth();
            const time = currentDate.getTime();
            const screenX = timeToScreenX(time);

            let requiredSpacing: number;
            let importance: number;

            if (month === 0) {
                requiredSpacing = 10;
                importance = 1.0;
            } else if (month % 3 === 0) {
                requiredSpacing = 20;
                importance = 0.7;
            } else {
                requiredSpacing = 35;
                importance = 0.4;
            }

            const fadeStart = requiredSpacing * 0.5;
            const fadeEnd = requiredSpacing;
            let monthOpacity = 0;
            if (monthSpacing >= fadeEnd) {
                monthOpacity = 1;
            } else if (monthSpacing > fadeStart) {
                monthOpacity = (monthSpacing - fadeStart) / (fadeEnd - fadeStart);
            }

            if (monthOpacity > 0.01) {
                if (screenX > 0 && screenX < width && !isTooClose(screenX)) {
                    const finalOpacity = monthOpacity * (0.5 + importance * 0.5);
                    const label = month === 0
                        ? currentDate.getFullYear().toString()
                        : currentDate.toLocaleString("en-US", { month: "short" });

                    gridLines.push({
                        key: `month-${time}`,
                        x: screenX,
                        label,
                        isMajor: month === 0,
                        opacity: finalOpacity,
                        lineHeight: 1,
                        isSubUnit: false,
                        fontWeight: Math.round(400 + importance * 200),
                        fontSize: Math.round(10 + importance * 2),
                        labelOpacity: finalOpacity,
                    });
                }
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }

    // WEEK LABELS
    if (spacings.week > MIN_SPACING.week * 0.4) {
        const opacity = calculateOpacity(spacings.week, MIN_SPACING.week);
        if (opacity > 0.01) {
            const startDate = new Date(startTime);
            const dow = startDate.getDay();
            let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - dow);

            while (currentDate.getTime() < endTime) {
                const time = currentDate.getTime();
                const screenX = timeToScreenX(time);
                const label = `W${getISOWeek(currentDate)}`;
                const importance = 0.5;
                const finalOpacity = opacity * (0.5 + importance * 0.5);

                if (screenX > 0 && screenX < width && !isTooClose(screenX)) {
                    gridLines.push({
                        key: `week-${time}`,
                        x: screenX,
                        label,
                        isMajor: false,
                        opacity: finalOpacity,
                        lineHeight: 1,
                        isSubUnit: false,
                        fontWeight: Math.round(400 + importance * 250),
                        fontSize: Math.round(10 + importance * 3),
                        labelOpacity: finalOpacity,
                    });
                }

                currentDate.setDate(currentDate.getDate() + 7);
            }
        }
    }

    // DAY LABELS
    if (spacings.day > MIN_SPACING.day * 0.4) {
        const opacity = calculateOpacity(spacings.day, MIN_SPACING.day);
        if (opacity > 0.01) {
            const startDate = new Date(startTime);
            let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

            while (currentDate.getTime() < endTime) {
                const time = currentDate.getTime();
                const screenX = timeToScreenX(time);
                const importance = currentDate.getDate() === 1 ? 1.0 : 0.5;
                const label = `${currentDate.getDate()} ${currentDate.toLocaleString("en-US", { weekday: "short" })}`;
                const finalOpacity = opacity * (0.5 + importance * 0.5);

                if (screenX > 0 && screenX < width && !isTooClose(screenX)) {
                    gridLines.push({
                        key: `day-${time}`,
                        x: screenX,
                        label,
                        isMajor: false,
                        opacity: finalOpacity,
                        lineHeight: 1,
                        isSubUnit: true,
                        fontWeight: Math.round(400 + importance * 250),
                        fontSize: Math.round(10 + importance * 3),
                        labelOpacity: finalOpacity,
                    });
                }

                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    }

    // HOUR LABELS - Progressive disclosure
    if (spacings.hour >= 2.5) {
        const hourSpacing = spacings.hour;
        const startDate = new Date(startTime);
        let currentDate = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
            startDate.getHours(),
        );

        while (currentDate.getTime() < endTime) {
            const hour = currentDate.getHours();
            const time = currentDate.getTime();
            const screenX = timeToScreenX(time);

            let requiredSpacing: number;
            let importance: number;

            if (hour === 0) {
                requiredSpacing = 5;
                importance = 1.0;
            } else if (hour === 12) {
                requiredSpacing = 8;
                importance = 0.9;
            } else if (hour % 6 === 0) {
                requiredSpacing = 12;
                importance = 0.7;
            } else if (hour % 3 === 0) {
                requiredSpacing = 18;
                importance = 0.5;
            } else {
                requiredSpacing = 25;
                importance = 0.3;
            }

            const fadeStart = requiredSpacing * 0.5;
            const fadeEnd = requiredSpacing;
            let hourOpacity = 0;
            if (hourSpacing >= fadeEnd) {
                hourOpacity = 1;
            } else if (hourSpacing > fadeStart) {
                hourOpacity = (hourSpacing - fadeStart) / (fadeEnd - fadeStart);
            }

            if (hourOpacity > 0.01) {
                if (screenX > 0 && screenX < width && !isTooClose(screenX)) {
                    const finalOpacity = hourOpacity * (0.5 + importance * 0.5);
                    gridLines.push({
                        key: `hour-${time}`,
                        x: screenX,
                        label: `${hour}h`,
                        isMajor: hour === 0,
                        opacity: finalOpacity,
                        lineHeight: 1,
                        isSubUnit: UNIT_HIERARCHY.hour <= 0.4,
                        fontWeight: Math.round(400 + importance * 200),
                        fontSize: Math.round(10 + importance * 2),
                        labelOpacity: finalOpacity,
                    });
                }
            }

            currentDate.setHours(currentDate.getHours() + 1);
        }
    }

    // MINUTE LABELS - Progressive disclosure
    if (spacings.minute >= 2.5) {
        const minuteSpacing = spacings.minute;
        const startDate = new Date(startTime);
        let currentDate = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
            startDate.getHours(),
            startDate.getMinutes(),
        );

        while (currentDate.getTime() < endTime) {
            const minute = currentDate.getMinutes();
            if (minute !== 0) {
                const time = currentDate.getTime();
                const screenX = timeToScreenX(time);

                let requiredSpacing: number;
                let importance: number;

                if (minute === 30) {
                    requiredSpacing = 5;
                    importance = 0.9;
                } else if (minute === 15 || minute === 45) {
                    requiredSpacing = 10;
                    importance = 0.7;
                } else if (minute % 10 === 0) {
                    requiredSpacing = 15;
                    importance = 0.55;
                } else if (minute % 5 === 0) {
                    requiredSpacing = 18;
                    importance = 0.45;
                } else {
                    requiredSpacing = 22;
                    importance = 0.3;
                }

                const fadeStart = requiredSpacing * 0.5;
                const fadeEnd = requiredSpacing;
                let minuteOpacity = 0;
                if (minuteSpacing >= fadeEnd) {
                    minuteOpacity = 1;
                } else if (minuteSpacing > fadeStart) {
                    minuteOpacity = (minuteSpacing - fadeStart) / (fadeEnd - fadeStart);
                }

                if (minuteOpacity > 0.01) {
                    if (screenX > 0 && screenX < width) {
                        const finalOpacity = minuteOpacity * (0.5 + importance * 0.5);
                        gridLines.push({
                            key: `minute-${time}`,
                            x: screenX,
                            label: `:${minute.toString().padStart(2, "0")}`,
                            isMajor: false,
                            opacity: finalOpacity,
                            lineHeight: 1,
                            isSubUnit: true,
                            fontWeight: Math.round(400 + importance * 150),
                            fontSize: 10,
                            labelOpacity: finalOpacity,
                        });
                    }
                }
            }
            currentDate.setMinutes(currentDate.getMinutes() + 1);
        }
    }

    return { gridLines, contextLabels };
}
