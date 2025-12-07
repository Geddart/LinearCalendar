/**
 * TimeGridRenderer Unit Tests
 * 
 * Tests the extracted grid calculation logic for correctness.
 */

import { describe, it, expect } from 'vitest';
import { calculateTimeGrid, type TimeGridConfig } from './TimeGridRenderer';

// Helper to create a config centered on a specific date
function createConfig(
    centerDate: Date,
    pixelsPerMs: number = 0.0001,
    width: number = 1000
): TimeGridConfig {
    const centerTime = centerDate.getTime();
    const halfWidthMs = (width / 2) / pixelsPerMs;

    return {
        startTime: centerTime - halfWidthMs,
        endTime: centerTime + halfWidthMs,
        centerTime,
        pixelsPerMs,
        width,
        isMobile: false,
        contextColWidth: 130,
    };
}

describe('TimeGridRenderer', () => {
    describe('calculateTimeGrid', () => {
        it('should return gridLines array and contextLabels', () => {
            const config = createConfig(new Date('2025-06-15T12:00:00'));
            const result = calculateTimeGrid(config);

            expect(result).toHaveProperty('gridLines');
            expect(result).toHaveProperty('contextLabels');
            expect(Array.isArray(result.gridLines)).toBe(true);
        });

        it('should set contextLabels based on center time', () => {
            const config = createConfig(new Date('2025-12-07T14:30:00'));
            const result = calculateTimeGrid(config);

            expect(result.contextLabels.year).toBe('2025');
            expect(result.contextLabels.month).toContain('December');
            expect(result.contextLabels.weekday).toBe('Sunday');
        });

        it('should generate grid lines when zoomed to day view', () => {
            // Day view: ~24 hours visible
            const config = createConfig(
                new Date('2025-06-15T12:00:00'),
                0.00001, // Shows roughly a day
                1000
            );
            const result = calculateTimeGrid(config);

            // Should have at least some hour labels at day view
            const hourLabels = result.gridLines.filter(l => l.key.startsWith('hour-'));
            expect(hourLabels.length).toBeGreaterThan(0);
        });

        it('should generate year labels when zoomed to decade view', () => {
            // Decade view: pixelsPerMs that shows ~10 years
            const YEAR_MS = 31536000000;
            const pixelsPerMs = 1000 / (YEAR_MS * 10);

            const config = createConfig(
                new Date('2025-06-15T12:00:00'),
                pixelsPerMs,
                1000
            );
            const result = calculateTimeGrid(config);

            // Should have year labels at decade view
            const yearLabels = result.gridLines.filter(l => l.key.startsWith('year-'));
            expect(yearLabels.length).toBeGreaterThan(0);
        });

        it('should not generate lines outside visible range', () => {
            const config = createConfig(new Date('2025-06-15T12:00:00'));
            const result = calculateTimeGrid(config);

            // All grid lines should have x position within screen bounds
            for (const line of result.gridLines) {
                expect(line.x).toBeGreaterThanOrEqual(0);
                expect(line.x).toBeLessThanOrEqual(config.width);
            }
        });

        it('should handle mobile mode (no left offset)', () => {
            const config = createConfig(new Date('2025-06-15T12:00:00'));
            config.isMobile = true;

            const result = calculateTimeGrid(config);

            // Should still generate valid grid lines
            expect(result.gridLines.length).toBeGreaterThan(0);
        });

        it('should set opacity values between 0 and 1', () => {
            const config = createConfig(new Date('2025-06-15T12:00:00'));
            const result = calculateTimeGrid(config);

            for (const line of result.gridLines) {
                expect(line.opacity).toBeGreaterThanOrEqual(0);
                expect(line.opacity).toBeLessThanOrEqual(1);
            }
        });

        it('should set font weights between 400 and 700', () => {
            const config = createConfig(new Date('2025-06-15T12:00:00'));
            const result = calculateTimeGrid(config);

            for (const line of result.gridLines) {
                expect(line.fontWeight).toBeGreaterThanOrEqual(400);
                expect(line.fontWeight).toBeLessThanOrEqual(700);
            }
        });

        it('should not place labels too close together (min 15px)', () => {
            const config = createConfig(new Date('2025-06-15T12:00:00'));
            const result = calculateTimeGrid(config);

            const MIN_DISTANCE = 15;
            const sortedLines = [...result.gridLines].sort((a, b) => a.x - b.x);

            for (let i = 1; i < sortedLines.length; i++) {
                const distance = sortedLines[i].x - sortedLines[i - 1].x;
                expect(distance).toBeGreaterThanOrEqual(MIN_DISTANCE);
            }
        });
    });
});
