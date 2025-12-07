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
 * Map event categories to calendar lane IDs.
 * Used for assigning events to their display lanes.
 */
const CATEGORY_TO_LANE: Record<string, string> = {
    work: 'work',
    personal: 'todo',
    health: 'health',
    travel: 'todo',
    social: 'people',
    other: 'todo'
};

/**
 * Generate mock calendar events for testing.
 *
 * @param count - Number of events to generate
 * @param yearRange - Range of years to spread events across
 */
/**
 * Generate events specifically around today's date for immediate visibility.
 */
export function generateTodayEvents(): CalendarEvent[] {
    const HOUR = 3600000;
    const DAY = 24 * HOUR;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return [
        // Yesterday
        {
            id: 'today-1',
            startTime: todayTime - DAY + 9 * HOUR,
            endTime: todayTime - DAY + 10 * HOUR,
            title: 'Morning coffee',
            description: 'Catch up with Sarah about the project',
            color: COLORS.social,
            importance: { duration: 0.3, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'people',
            location: { name: 'Blue Bottle Coffee', address: '123 Main St' },
            attendees: [{ name: 'Sarah', email: 'sarah@example.com', status: 'accepted' }]
        },
        {
            id: 'today-2',
            startTime: todayTime - DAY + 14 * HOUR,
            endTime: todayTime - DAY + 15 * HOUR,
            title: 'Team standup',
            description: 'Daily sync with engineering team',
            color: COLORS.work,
            importance: { duration: 0.3, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'work',
            conferenceUrl: 'https://meet.google.com/abc-defg-hij',
            attendees: [
                { name: 'Alex', status: 'accepted', isOrganizer: true },
                { name: 'Jordan', status: 'accepted' },
                { name: 'Casey', status: 'tentative' }
            ]
        },
        // Today
        {
            id: 'today-3',
            startTime: todayTime + 8 * HOUR,
            endTime: todayTime + 9 * HOUR,
            title: 'Morning workout',
            color: COLORS.health,
            importance: { duration: 0.3, aiScore: 0.6, manual: 0.5, effective: 0.55 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'health'
        },
        {
            id: 'today-4',
            startTime: todayTime + 10 * HOUR,
            endTime: todayTime + 12 * HOUR,
            title: 'Project planning',
            color: COLORS.work,
            importance: { duration: 0.4, aiScore: 0.7, manual: 0.6, effective: 0.6 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'work'
        },
        {
            id: 'today-5',
            startTime: todayTime + 13 * HOUR,
            endTime: todayTime + 14 * HOUR,
            title: 'Lunch with Alex',
            color: COLORS.social,
            importance: { duration: 0.3, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'people'
        },
        {
            id: 'today-6',
            startTime: todayTime + 15 * HOUR,
            endTime: todayTime + 16 * HOUR,
            title: 'Code review',
            color: COLORS.work,
            importance: { duration: 0.3, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'work'
        },
        {
            id: 'today-7',
            startTime: todayTime + 18 * HOUR,
            endTime: todayTime + 20 * HOUR,
            title: 'Dinner party',
            color: COLORS.social,
            importance: { duration: 0.4, aiScore: 0.6, manual: 0.6, effective: 0.55 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'people'
        },
        // Tomorrow
        {
            id: 'today-8',
            startTime: todayTime + DAY + 9 * HOUR,
            endTime: todayTime + DAY + 10.5 * HOUR,
            title: 'Doctor appointment',
            color: COLORS.health,
            importance: { duration: 0.35, aiScore: 0.7, manual: 0.6, effective: 0.6 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'health'
        },
        {
            id: 'today-9',
            startTime: todayTime + DAY + 14 * HOUR,
            endTime: todayTime + DAY + 16 * HOUR,
            title: 'Client presentation',
            color: COLORS.work,
            importance: { duration: 0.4, aiScore: 0.8, manual: 0.7, effective: 0.7 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'work'
        },
        // Next week
        {
            id: 'today-10',
            startTime: todayTime + 3 * DAY + 10 * HOUR,
            endTime: todayTime + 3 * DAY + 11 * HOUR,
            title: 'Dentist checkup',
            color: COLORS.personal,
            importance: { duration: 0.3, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'todo'
        },
        {
            id: 'today-11',
            startTime: todayTime + 5 * DAY,
            endTime: todayTime + 7 * DAY,
            title: 'Weekend getaway',
            color: COLORS.travel,
            importance: { duration: 0.6, aiScore: 0.8, manual: 0.8, effective: 0.75 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'todo'
        },
        // Last week
        {
            id: 'today-12',
            startTime: todayTime - 3 * DAY + 11 * HOUR,
            endTime: todayTime - 3 * DAY + 12 * HOUR,
            title: 'Team retrospective',
            color: COLORS.work,
            importance: { duration: 0.3, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'work'
        },
        {
            id: 'today-13',
            startTime: todayTime - 5 * DAY + 19 * HOUR,
            endTime: todayTime - 5 * DAY + 22 * HOUR,
            title: 'Movie night',
            color: COLORS.social,
            importance: { duration: 0.4, aiScore: 0.5, manual: 0.5, effective: 0.5 },
            isLifeEvent: false,
            source: 'mock',
            calendarLaneId: 'people'
        }
    ];
}

export function generateMockEvents(
    count: number = 1000,
    yearRange: [number, number] = [2000, 2026]
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
            source: 'mock',
            calendarLaneId: CATEGORY_TO_LANE[category] || 'todo'
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
            source: 'mock',
            calendarLaneId: 'todo'
        },
        {
            id: 'life-2',
            startTime: new Date(1996, 8, 1).getTime(),
            endTime: new Date(2000, 5, 30).getTime(),
            title: 'Elementary School',
            color: '#D4E3B8',
            importance: { duration: 1, aiScore: 0.9, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock',
            calendarLaneId: 'todo'
        },
        {
            id: 'life-3',
            startTime: new Date(2010, 8, 1).getTime(),
            endTime: new Date(2014, 5, 30).getTime(),
            title: 'University',
            color: '#B8D4E3',
            importance: { duration: 1, aiScore: 0.9, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock',
            calendarLaneId: 'work'
        },
        {
            id: 'life-4',
            startTime: new Date(2020, 2, 15).getTime(),
            endTime: new Date(2020, 2, 16).getTime(),
            title: 'COVID Lockdown Starts',
            color: '#E3D4B8',
            importance: { duration: 0, aiScore: 1, manual: 1, effective: 1 },
            isLifeEvent: true,
            source: 'mock',
            calendarLaneId: 'todo'
        }
    ];
}
