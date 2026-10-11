/** Drive the public Fjord menu, keeping secondary controls out of the world HUD. */
export async function openFjordMenu(page) {
    if (!await page.locator('#fjord-menu').evaluate(menu => menu.open))
        await page.locator('#fjord-menu > summary').click();
}
export async function closeFjordMenu(page) {
    if (await page.locator('#fjord-menu').evaluate(menu => menu.open))
        await page.locator('#fjord-menu > summary').click();
}
export async function selectFjordQuality(page, quality) {
    await openFjordMenu(page);
    await page.selectOption('#fjord-quality', quality);
    await closeFjordMenu(page);
}
export async function selectFjordPace(page, pace) {
    const movedToMenu = !await page.locator('#fjord-cycle').isVisible();
    if (movedToMenu) await openFjordMenu(page);
    await page.selectOption('#fjord-cycle', pace);
    if (movedToMenu) await closeFjordMenu(page);
}
export async function openFjordCampaign(page) {
    await openFjordMenu(page);
    if (!await page.locator('#fjord-campaign').evaluate(campaign => campaign.open))
        await page.locator('#fjord-campaign > summary').click();
}
export async function toggleFjordCampaign(page) {
    await openFjordMenu(page);
    await page.locator('#fjord-campaign > summary').click();
    if (!await page.locator('#fjord-campaign').evaluate(campaign => campaign.open))
        await closeFjordMenu(page);
}
export async function advanceFjordYear(page) {
    await page.locator('#fjord-next').click();
}
