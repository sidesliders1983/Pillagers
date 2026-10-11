import { seasonBlend } from '../config/timeVisualization';

/** Calendar labels stay at quarter boundaries; northern Winter thaw starts in Spring. */
export function projectFjordCalendar(time: { winter: number; tick: number }, ticksPerYear: number) {
    const progress = time.tick / ticksPerYear;
    const season = seasonBlend(progress).from.name;
    // Hold the Winter palette, then pass through Spring before reaching Summer on time.
    const visualProgress = progress < .25 ? 0 : progress < .5 ? (progress - .25) * 2 : progress;
    const { from, to, mix } = seasonBlend(visualProgress);
    return {
        season,
        year: time.winter,
        progress,
        visualProgress,
        winterWeight: from.name === 'Winter' ? 1 - mix : to.name === 'Winter' ? mix : 0
    };
}
export type FjordCalendar = ReturnType<typeof projectFjordCalendar>;
