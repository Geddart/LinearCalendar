/**
 * Historical Events - Major human achievements over ~5000 years
 * 
 * These serve as landmarks when zoomed out to century/millennium views.
 * Dates are as accurate as historical records allow.
 */

import type { CalendarEvent } from '$lib/types/Event';

interface HistoricalEventData {
    year: number;
    month?: number;  // 0-indexed (0 = January, 11 = December)
    day?: number;    // 1-31
    title: string;
    description?: string;
    category: 'science' | 'technology' | 'art' | 'politics' | 'exploration' | 'culture';
}

const HISTORICAL_EVENTS_DATA: HistoricalEventData[] = [
    // Ancient History (dates are estimates for many ancient events)
    { year: -2560, month: 6, day: 1, title: 'Great Pyramid of Giza Completed', category: 'culture' }, // Estimated ~2560 BCE
    { year: -776, month: 6, day: 1, title: 'First Olympic Games', category: 'culture' }, // Summer 776 BCE
    { year: -509, month: 8, day: 1, title: 'Roman Republic Founded', category: 'politics' }, // Traditional date September 509 BCE
    { year: -323, month: 5, day: 10, title: 'Death of Alexander the Great', category: 'politics' }, // June 10-11 323 BCE
    { year: -221, month: 0, day: 1, title: 'Great Wall of China Begun', category: 'culture' }, // Qin Dynasty start 221 BCE

    // Classical Era
    { year: 79, month: 7, day: 24, title: 'Vesuvius Destroys Pompeii', category: 'culture' }, // August 24, 79 AD
    { year: 476, month: 8, day: 4, title: 'Fall of Western Roman Empire', category: 'politics' }, // September 4, 476 AD

    // Medieval
    { year: 800, month: 11, day: 25, title: 'Charlemagne Crowned Emperor', category: 'politics' }, // December 25, 800
    { year: 1066, month: 9, day: 14, title: 'Battle of Hastings', category: 'politics' }, // October 14, 1066
    { year: 1215, month: 5, day: 15, title: 'Magna Carta Signed', category: 'politics' }, // June 15, 1215
    { year: 1347, month: 9, day: 1, title: 'Black Death Reaches Europe', category: 'culture' }, // October 1347

    // Renaissance & Early Modern
    { year: 1440, month: 0, day: 1, title: 'Gutenberg Printing Press', category: 'technology' }, // ~1440
    { year: 1453, month: 4, day: 29, title: 'Fall of Constantinople', category: 'politics' }, // May 29, 1453
    { year: 1492, month: 9, day: 12, title: 'Columbus Reaches Americas', category: 'exploration' }, // October 12, 1492
    { year: 1503, month: 0, day: 1, title: 'Mona Lisa Painted', category: 'art' }, // Started ~1503
    { year: 1517, month: 9, day: 31, title: 'Protestant Reformation', category: 'culture' }, // October 31, 1517
    { year: 1543, month: 4, day: 24, title: 'Copernicus Heliocentric Theory', category: 'science' }, // May 24, 1543
    { year: 1564, month: 3, day: 23, title: 'Shakespeare Born', category: 'art' }, // April 23, 1564
    { year: 1610, month: 0, day: 7, title: "Galileo's Telescope Discoveries", category: 'science' }, // January 7, 1610
    { year: 1687, month: 6, day: 5, title: "Newton's Principia Published", category: 'science' }, // July 5, 1687

    // Age of Revolution
    { year: 1776, month: 6, day: 4, title: 'US Declaration of Independence', category: 'politics' }, // July 4, 1776
    { year: 1789, month: 6, day: 14, title: 'Storming of the Bastille', category: 'politics' }, // July 14, 1789
    { year: 1804, month: 11, day: 2, title: 'Napoleon Crowned Emperor', category: 'politics' }, // December 2, 1804
    { year: 1815, month: 5, day: 18, title: 'Battle of Waterloo', category: 'politics' }, // June 18, 1815

    // Industrial Age
    { year: 1859, month: 10, day: 24, title: "Darwin's Origin of Species", category: 'science' }, // November 24, 1859
    { year: 1865, month: 3, day: 9, title: 'US Civil War Ends', category: 'politics' }, // April 9, 1865
    { year: 1876, month: 2, day: 10, title: 'Telephone Invented', category: 'technology' }, // March 10, 1876
    { year: 1879, month: 9, day: 21, title: "Edison's Light Bulb", category: 'technology' }, // October 21, 1879
    { year: 1886, month: 0, day: 29, title: 'First Automobile Patented', category: 'technology' }, // January 29, 1886
    { year: 1895, month: 10, day: 8, title: 'X-Rays Discovered', category: 'science' }, // November 8, 1895
    { year: 1895, month: 11, day: 28, title: 'First Film Screening', category: 'art' }, // December 28, 1895

    // 20th Century
    { year: 1903, month: 11, day: 17, title: 'First Powered Flight', category: 'technology' }, // December 17, 1903
    { year: 1905, month: 5, day: 30, title: "Einstein's Relativity", category: 'science' }, // June 30, 1905
    { year: 1914, month: 6, day: 28, title: 'World War I Begins', category: 'politics' }, // July 28, 1914
    { year: 1918, month: 10, day: 11, title: 'World War I Ends', category: 'politics' }, // November 11, 1918
    { year: 1928, month: 8, day: 28, title: 'Penicillin Discovered', category: 'science' }, // September 28, 1928
    { year: 1939, month: 8, day: 1, title: 'World War II Begins', category: 'politics' }, // September 1, 1939
    { year: 1945, month: 7, day: 6, title: 'Hiroshima Atomic Bomb', category: 'politics' }, // August 6, 1945
    { year: 1945, month: 8, day: 2, title: 'World War II Ends', category: 'politics' }, // September 2, 1945
    { year: 1947, month: 11, day: 23, title: 'Transistor Invented', category: 'technology' }, // December 23, 1947
    { year: 1953, month: 3, day: 25, title: 'DNA Structure Discovered', category: 'science' }, // April 25, 1953
    { year: 1957, month: 9, day: 4, title: 'Sputnik Launched', category: 'exploration' }, // October 4, 1957
    { year: 1961, month: 3, day: 12, title: 'First Human in Space', category: 'exploration' }, // April 12, 1961
    { year: 1969, month: 6, day: 20, title: 'Moon Landing', category: 'exploration' }, // July 20, 1969
    { year: 1971, month: 9, day: 29, title: 'First Email Sent', category: 'technology' }, // October 29, 1971
    { year: 1981, month: 7, day: 12, title: 'First IBM PC', category: 'technology' }, // August 12, 1981
    { year: 1989, month: 2, day: 12, title: 'World Wide Web Proposed', category: 'technology' }, // March 12, 1989
    { year: 1989, month: 10, day: 9, title: 'Berlin Wall Falls', category: 'politics' }, // November 9, 1989
    { year: 1990, month: 3, day: 24, title: 'Hubble Telescope Launched', category: 'exploration' }, // April 24, 1990
    { year: 1997, month: 1, day: 22, title: 'Dolly the Sheep Announced', category: 'science' }, // February 22, 1997

    // 21st Century
    { year: 2001, month: 1, day: 12, title: 'Human Genome Mapped', category: 'science' }, // February 12, 2001
    { year: 2004, month: 1, day: 4, title: 'Facebook Founded', category: 'technology' }, // February 4, 2004
    { year: 2007, month: 5, day: 29, title: 'iPhone Released', category: 'technology' }, // June 29, 2007
    { year: 2012, month: 6, day: 4, title: 'Higgs Boson Discovered', category: 'science' }, // July 4, 2012
    { year: 2016, month: 1, day: 11, title: 'Gravitational Waves Detected', category: 'science' }, // February 11, 2016
    { year: 2020, month: 2, day: 11, title: 'COVID-19 Pandemic Declared', category: 'culture' }, // March 11, 2020
    { year: 2022, month: 10, day: 30, title: 'ChatGPT Released', category: 'technology' }, // November 30, 2022
    { year: 2024, month: 6, day: 11, title: 'SpaceX Starship First Orbital', category: 'exploration' }, // June 2024 (estimated)
];

const CATEGORY_COLORS: Record<string, string> = {
    science: '#4285f4',     // Blue
    technology: '#0f9d58',  // Green
    art: '#ab47bc',         // Purple
    politics: '#ea4335',    // Red
    exploration: '#00bcd4', // Cyan
    culture: '#ff9800',     // Orange
};

/**
 * Generate historical events as CalendarEvents
 */
export function generateHistoricalEvents(): CalendarEvent[] {
    return HISTORICAL_EVENTS_DATA.map((event, index) => {
        // Convert year/month/day to timestamp
        const year = event.year;
        const month = event.month ?? 0;  // Default to January if not specified
        const day = event.day ?? 1;      // Default to 1st if not specified

        // Handle BCE dates
        const date = new Date(year < 0 ? Math.abs(year) : year, month, day);
        if (year < 0) {
            date.setFullYear(year);
        }
        const startTime = date.getTime();

        // Historical events show as 1-day markers
        const endTime = startTime + 24 * 60 * 60 * 1000;

        return {
            id: `historical-${index}`,
            title: event.title,
            description: event.description,
            startTime,
            endTime,
            color: CATEGORY_COLORS[event.category] || '#888888',
            category: 'historical',
            source: 'manual',
            importance: {
                duration: 0,
                aiScore: 1.0, // Always high importance
                manual: 1.0,
                effective: 1.0,
            },
            isLifeEvent: true,
        };
    });
}

/**
 * Get historical events count
 */
export function getHistoricalEventsCount(): number {
    return HISTORICAL_EVENTS_DATA.length;
}
