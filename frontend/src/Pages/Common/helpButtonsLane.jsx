// For a row in a centred container whose links or buttons would run under the
// help buttons (FloatingHelp): it stops 142 px short of the screen edge from a
// phone's width up (the buttons take 121 px with their margin), padding only
// what the side margin does not already give, so a wide screen is unchanged.
// A .jsx file because Tailwind reads only those for class names; pinned to the
// common-shell chunk (vite.config.js) as the footer and the flights page share it.
export const clearOfHelpButtons = 'sm:pr-[max(0px,calc(142px_-_(100vw_-_100%)_/_2))]';
