import next from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "scripts/out/**"] },
  {
    rules: {
      // The shipyard hydrates the saved build and the hangar from localStorage
      // on mount, which is exactly the "sync with an external store" case.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
