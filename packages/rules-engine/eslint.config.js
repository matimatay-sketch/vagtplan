import js from "@eslint/js";
import tseslint from "typescript-eslint";

// The rules engine must stay pure: no database, UI, network or Node APIs.
const forbidden = [
  "@supabase/*",
  "next",
  "next/*",
  "react",
  "react-dom",
  "node:*",
  "fs",
  "path",
  "http",
  "https",
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: forbidden.map((group) => ({
            group: [group],
            message: "rules-engine must stay pure",
          })),
        },
      ],
    },
  },
  { ignores: ["coverage/**"] },
);
