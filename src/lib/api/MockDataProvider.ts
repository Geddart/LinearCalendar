import type { CalendarEvent } from '$lib/types/Event';

/**
 * PASTEL COLOR PALETTE
 *
 * Soft, muted colors for different event categories.
 */
const COLORS = {
    work: '#B8D4E3', // Soft blue
    personal: '#E3D4B8', // Warm beige
    health: '#D4E3B8', // Soft green
    travel: '#E3B8D4', // Soft pink
    social: '#D4B8E3', // Soft purple
    other: '#B8E3D4' // Soft teal
};

/**
 * Generate mock calendar events for testing.
 *
 * @param count - Number of events to generate
 * @param yearRange - Range of years to spread events across
 */
export function generateMockEvents(
    count: number = 1000,
    yearRange: [number, number] = [2000, 2025]
): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const categories = Object.keys(COLORS) as (keyof typeof COLORS)[];

    // Time constants
    const HOUR = 3600000;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const YEAR = 365 * DAY;

    // Start and end timestamps
    const startYear = new Date(yearRange[0], 0, 1).getTime();
    const endYear = new Date(yearRange[1], 11, 31).getTime();
    const timeRange = endYear - startYear;

    // Event title templates by category
    const titles: Record<string, string[]> = {
        work: ['Meeting', 'Project deadline', 'Call with client', 'Review', 'Workshop', 'Conference'],
        personal: ['Dentist', 'Haircut', 'Errands', 'Birthday party', 'Family dinner'],
        health: ['Gym', 'Doctor appointment', 'Yoga class', 'Run', 'Meditation'],
        travel: ['Flight', 'Vacation', 'Road trip', 'Weekend getaway', 'Business trip'],
        social: ['Dinner with friends', 'Coffee', 'Party', 'Game night', 'Movie'],
        other: ['Task', 'Reminder', 'Event', 'Appointment']
    };

    // Duration distributions by category (in ms)
    const durations: Record<string, number[]> = {
        work: [HOUR, 2 * HOUR, 4 * HOUR, DAY],
        personal: [HOUR, 2 * HOUR],
        health: [HOUR, 1.5 * HOUR],
        travel: [DAY, 3 * DAY, WEEK, 2 * WEEK],
        social: [2 * HOUR, 3 * HOUR],
        other: [HOUR, 2 * HOUR]
    };

    for (let i = 0; i < count; i++) {
        // Random category
        const category = categories[Math.floor(Math.random() * categories.length)];

        // Random start time within range
        const startTime = startYear + Math.random() * timeRange;

        // Random duration based on category
        const durationOptions = durations[category];
        const duration = durationOptions[Math.floor(Math.random() * durationOptions.length)];

        // Random title
        const titleOptions = titles[category];
        const title = titleOptions[Math.floor(Math.random() * titleOptions.length)];

        // Calculate importance based on duration
        const durationImportance = Math.min(1, Math.log(duration / HOUR) / Math.log(YEAR / HOUR));

        // Some events are life events (5% chance for long events)
        const isLifeEvent = duration > WEEK && Math.random() < 0.05;

        events.push({
            id: `event-${i}`,
            startTime,
            endTime: startTime + duration,
            title,
            color: COLORS[category],
            category,
            importance: {
                duration: durationImportance,
                aiScore: 0.5, // Default, would be set by AI later
                manual: isLifeEvent ? 1 : 0.5,
                effective: isLifeEvent ? 1 : durationImportance * 0.5 + 0.25
            },
            isLifeEvent,
            source: 'mock'
        });
    }

    // Sort by start time
    events.sort((a, b) => a.startTime - b.startTime);

    return events;
}

/**
 * Generate some specific life events for testing zoom levels.
 */
export function generateLifeEvents(): CalendarEvent[] {
    return [
        {
            id: 'life-1',
            startTime: new Date(1990, 0, 1).getTime(),
            endTime: new Date(1990, 0, 2).getTime(),
            title: 'My Birth',
            color: '#E3B8D4',
            importance: { duration: 0, aiScore: 1, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock'
        },
        {
            id: 'life-2',
            startTime: new Date(1996, 8, 1).getTime(),
            endTime: new Date(2000, 5, 30).getTime(),
            title: 'Elementary School',
            color: '#D4E3B8',
            importance: { duration: 1, aiScore: 0.9, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock'
        },
        {
            id: 'life-3',
            startTime: new Date(2010, 8, 1).getTime(),
            endTime: new Date(2014, 5, 30).getTime(),
            title: 'University',
            color: '#B8D4E3',
            importance: { duration: 1, aiScore: 0.9, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock'
        },
        {
            id: 'life-4',
            startTime: new Date(2020, 2, 15).getTime(),
            endTime: new Date(2020, 2, 16).getTime(),
            title: 'COVID Lockdown Starts',
            color: '#E3D4B8',
            importance: { duration: 0, aiScore: 1, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock'
        }
    ];
}
