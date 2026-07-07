/** Tailwind only expands the @tailwind/@apply directives in
 * app/(marketing)/marketing.css — the shop's globals.css contains none, so it
 * passes through untouched. */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
