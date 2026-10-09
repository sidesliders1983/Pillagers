/** Follow the visible UI; older frozen review builds have no Settings disclosure. */
export async function openEnvironmentSettings(page) {
    const settings = page.locator('#environment-settings');
    if (await settings.count() && await settings.getAttribute('open') === null) {
        await settings.locator('summary').click();
    }
}
