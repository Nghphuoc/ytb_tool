import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    files: ["src/automation/**", "scripts/**"],
    rules: {
      "@remotion/deterministic-randomness": "off",
    },
  },
];
