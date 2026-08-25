// ESLint flat config — enforces the selector-quarantine rule from PRD §1.6 / §5.3.
// Any regex literal is forbidden outside src/core/siteAdapters.ts. This is the
// simplest form of the rule that satisfies the spec ("every regex lives in
// siteAdapters.ts") without needing a programmatic regex-source check that
// ESLint's selector syntax doesn't natively support.
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import path from "node:path";

const ADAPTER_PATH = path.resolve("src/core/siteAdapters.ts");

function isInAdapter(filename) {
  if (!filename) return false;
  try {
    return path.resolve(filename) === ADAPTER_PATH;
  } catch {
    return false;
  }
}

const baseConfig = {
  languageOptions: {
    parser: tsparser,
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
  plugins: { "@typescript-eslint": tseslint },
};

const FORBID_REGEX = {
  selector: "Literal[regex]",
  message:
    "Regex literals are forbidden outside src/core/siteAdapters.ts (selector quarantine, PRD §1.6).",
};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.config.js",
      "*.config.ts",
      "eslint.config.js",
      "**/*.test.ts",
    ],
  },
  {
    ...baseConfig,
    files: ["**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", FORBID_REGEX],
    },
  },
  {
    ...baseConfig,
    files: ["src/core/siteAdapters.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
];
