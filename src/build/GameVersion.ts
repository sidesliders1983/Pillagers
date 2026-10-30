/** Public product milestones are independent of package and save versions. */
export function describeGameVersion(version: string) {
    const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(alpha|beta))?$/.exec(version);
    if (!match) throw new Error('Invalid public game version.');
    const [, major, minor, patch, phase] = match;
    return { version, channel: phase ?? 'stable',
        displayVersion: 'v' + major + '.' + minor + (patch === '0' ? '' : '.' + patch) + (phase ? ' ' + phase : '') };
}
