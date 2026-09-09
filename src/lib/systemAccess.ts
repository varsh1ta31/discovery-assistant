/** File resources remain linked to steps, but do not require a dedicated API.
 * This deliberately does not exempt hosting applications such as SharePoint,
 * Google Sheets, or document-management systems from integration discovery.
 */
export function isSpreadsheetFile(name: string): boolean {
  return /\b(spreadsheet|workbook|excel file|csv file)\b|\.(xlsx?|xlsm|csv)\b/i.test(name);
}

export function hasUnconfirmedApiGap(system: {
  name: string;
  apiAvailability: string;
  apiAvailabilityConfirmed: boolean;
}): boolean {
  return !isSpreadsheetFile(system.name)
    && system.apiAvailability === "UNKNOWN"
    && !system.apiAvailabilityConfirmed;
}
