/**
 * Historical Events - Major human achievements over ~5000 years
 * 
 * These serve as landmarks when zoomed out to century/millennium views.
 */

import type { CalendarEvent } from '$lib/types/Event';

interface HistoricalEventData {
    year: number;
    title: string;
    description?: string;
    category: 'science' | 'technology' | 'art' | 'politics' | 'exploration' | 'culture';
}

const HISTORICAL_EVENTS_DATA: HistoricalEventData[] = [
    // Ancient History
    { year: -3000, title: 'Egyptian Pyramids Built', category: 'culture' },
    { year: -2560, title: 'Great Pyramid of Giza', category: 'culture' },
    { year: -776, title: 'First Olympic Games', category: 'culture' },
    { year: -509, title: 'Roman Republic Founded', category: 'politics' },
    { year: -323, title: 'Death of Alexander the Great', category: 'politics' },
    { year: -221, title: 'Great Wall of China Begun', category: 'culture' },

    // Classical Era
    { year: 0, title: 'Year Zero (AD/BC)', category: 'culture' },
    { year: 79, title: 'Vesuvius Destroys Pompeii', category: 'culture' },
    { year: 476, title: 'Fall of Roman Empire', category: 'politics' },

    // Medieval
    { year: 800, title: 'Charlemagne Crowned', category: 'politics' },
    { year: 1066, title: 'Norman Conquest of England', category: 'politics' },
    { year: 1215, title: 'Magna Carta Signed', category: 'politics' },
    { year: 1347, title: 'Black Death Reaches Europe', category: 'culture' },

    // Renaissance & Early Modern
    { year: 1440, title: 'Gutenberg Printing Press', category: 'technology' },
    { year: 1453, title: 'Fall of Constantinople', category: 'politics' },
    { year: 1492, title: 'Columbus Reaches Americas', category: 'exploration' },
    { year: 1503, title: 'Mona Lisa Painted', category: 'art' },
    { year: 1517, title: 'Protestant Reformation', category: 'culture' },
    { year: 1543, title: 'Copernicus Heliocentric Theory', category: 'science' },
    { year: 1564, title: 'Shakespeare Born', category: 'art' },
    { year: 1609, title: 'Galileo\'s Telescope', category: 'science' },
    { year: 1687, title: 'Newton\'s Principia', category: 'science' },

    // Age of Revolution
    { year: 1776, title: 'US Declaration of Independence', category: 'politics' },
    { year: 1789, title: 'French Revolution', category: 'politics' },
    { year: 1804, title: 'Napoleon Crowned Emperor', category: 'politics' },
    { year: 1815, title: 'Battle of Waterloo', category: 'politics' },

    // Industrial Age
    { year: 1859, title: 'Darwin\'s Origin of Species', category: 'science' },
    { year: 1865, title: 'US Civil War Ends', category: 'politics' },
    { year: 1876, title: 'Telephone Invented', category: 'technology' },
    { year: 1879, title: 'Edison\'s Light Bulb', category: 'technology' },
    { year: 1885, title: 'First Automobile', category: 'technology' },
    { year: 1895, title: 'X-Rays Discovered', category: 'science' },
    { year: 1895, title: 'First Film Screening', category: 'art' },

    // 20th Century
    { year: 1903, title: 'First Powered Flight', category: 'technology' },
    { year: 1905, title: 'Einstein\'s Relativity', category: 'science' },
    { year: 1914, title: 'World War I Begins', category: 'politics' },
    { year: 1918, title: 'World War I Ends', category: 'politics' },
    { year: 1928, title: 'Penicillin Discovered', category: 'science' },
    { year: 1939, title: 'World War II Begins', category: 'politics' },
    { year: 1945, title: 'WWII Ends, Atomic Bomb', category: 'politics' },
    { year: 1947, title: 'Transistor Invented', category: 'technology' },
    { year: 1953, title: 'DNA Structure Discovered', category: 'science' },
    { year: 1957, title: 'Sputnik Launched', category: 'exploration' },
    { year: 1961, title: 'First Human in Space', category: 'exploration' },
    { year: 1969, title: 'Moon Landing', category: 'exploration' },
    { year: 1971, title: 'First Email Sent', category: 'technology' },
    { year: 1981, title: 'First IBM PC', category: 'technology' },
    { year: 1989, title: 'World Wide Web Created', category: 'technology' },
    { year: 1989, title: 'Berlin Wall Falls', category: 'politics' },
    { year: 1990, title: 'Hubble Telescope Launched', category: 'exploration' },
    { year: 1997, title: 'First Cloned Mammal (Dolly)', category: 'science' },

    // 21st Century
    { year: 2001, title: 'Human Genome Mapped', category: 'science' },
    { year: 2004, title: 'Facebook Founded', category: 'technology' },
    { year: 2007, title: 'iPhone Released', category: 'technology' },
    { year: 2012, title: 'Higgs Boson Discovered', category: 'science' },
    { year: 2016, title: 'Gravitational Waves Detected', category: 'science' },
    { year: 2020, title: 'COVID-19 Pandemic', category: 'culture' },
    { year: 2022, title: 'ChatGPT Released', category: 'technology' },
    { year: 2024, title: 'First Commercial Space Flights', category: 'exploration' },
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
        // Convert year to timestamp (January 1 of that year)
        const year = event.year;
        const date = new Date(year < 0 ? Math.abs(year) : year, 0, 1);
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
