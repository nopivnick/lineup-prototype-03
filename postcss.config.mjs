// Mantine's recommended PostCSS setup: its `rem`/`em` helpers and the
// `light-dark()` and breakpoint mixins are compiled here, not at runtime.
// https://mantine.dev/styles/postcss-preset/
const config = {
  plugins: {
    "postcss-preset-mantine": {},
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
  },
};

export default config;
