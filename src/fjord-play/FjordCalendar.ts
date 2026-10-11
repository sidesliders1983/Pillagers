import { seasonBlend } from '../config/timeVisualization';

/** Four visual seasons derived from the existing Winter-to-Winter calendar. */
export function projectFjordCalendar(time: { winter: number; tick: number }, ticksPerYear: number) {
    const progress = time.tick / ticksPerYear;
    const { from, to, mix } = seasonBlend(progress);
    return {
        season: from.name,
        year: time.winter,
        progress,
        winterWeight: from.name === 'Winter' ? 1 - mix : to.name === 'Winter' ? mix : 0
    };
}
export type FjordCalendar = ReturnType<typeof projectFjordCalendar>;
