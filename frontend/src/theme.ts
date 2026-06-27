import { createTheme, type MantineColorsTuple } from "@mantine/core";

// ── The "super bonito" foundation ────────────────────────────────────────────
// Every Molde app inherits this theme. Tweak the brand color, fonts and radius
// per app (drive it from the screenshots in .brief/inspiration/). Mantine reads
// `primaryColor` + the tuple below to derive buttons, links, focus rings, etc.

const brand: MantineColorsTuple = [
  "#f2effe",
  "#ddd6f8",
  "#b9aaf1",
  "#937cec",
  "#7355e7",
  "#5f3de5",
  "#5631e4",
  "#4625cb",
  "#3d1fb6",
  "#3219a0",
];

export const theme = createTheme({
  primaryColor: "brand",
  colors: { brand },
  defaultRadius: "md",
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: "700",
  },
  cursorType: "pointer",
});
