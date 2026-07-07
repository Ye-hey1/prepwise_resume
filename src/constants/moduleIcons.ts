export const MODULE_ICON_VIEWBOX = '0 0 24 24'

const MODULE_ICON_PATHS: Record<string, string[]> = {
  basicInfo: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  education: ['M3 8.5 12 4l9 4.5-9 4.5-9-4.5z', 'M7 11v4.5a5 5 0 0 0 10 0V11'],
  skills: ['M8 6l-4 4 4 4', 'M16 6l4 4-4 4', 'M14 4l-4 12'],
  workExperience: ['M3 7h18v12H3z', 'M8 7V5h8v2', 'M3 11h18'],
  projectExperience: ['M3 6h6v6H3z', 'M15 6h6v6h-6z', 'M3 18h6v-6H3z', 'M15 18h6v-6h-6z'],
  personalWorks: ['M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93', 'M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07'],
  trainingExperience: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z', 'M8 7h8', 'M8 11h6'],
  awards: ['M12 17l-5 3 1.6-5.8L4 10.2l6-.2L12 4l2 6 6 .2-4.6 4 1.6 5.8-5-3z'],
  customSections: ['M12 3v18', 'M3 12h18', 'M5 5h4v4H5z', 'M15 5h4v4h-4z', 'M5 15h4v4H5z', 'M15 15h4v4h-4z'],
  selfIntro: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h6'],
}

export function getModuleIconPaths(key: string): string[] {
  return MODULE_ICON_PATHS[key] ?? MODULE_ICON_PATHS.basicInfo ?? []
}
