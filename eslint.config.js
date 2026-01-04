import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "node_modules/**",
      ".git/**",
      "**/*.config.js",
      "dashboard-ui/**",
      "_wip_ui/**",
      "mcp-servers/**",
      ".opencode/node_modules/**",
      "dist/**",
      "build/**"
    ]
  },
  {
    files: ["tools/**/*.ts", ".opencode/plugin/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: false
        },
        project: null
      },
      globals: {
        // Node.js globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        NodeJS: "readonly",
        // Timers
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Web APIs
        Response: "readonly",
        Timer: "readonly",
        // Bun globals
        Bun: "readonly",
        bunEnv: "readonly"
      }
    },
    plugins: {
      import: importPlugin,
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      
      // Import rules for catching missing dependencies
      "import/no-unresolved": [
        "error",
        {
          ignore: [
            "bun",
            "bun:*",
            "@opencode-ai/plugin"
          ]
        }
      ],
      "import/named": "error",
      "import/default": "error",
      "import/namespace": "error",
      "import/export": "error",
      "import/no-duplicates": "error",
      "import/no-cycle": "warn",
      
      // TypeScript-specific variable rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "no-unused-vars": "off", // Disabled in favor of @typescript-eslint version
      
      // Best practices
      "no-console": "off", // CLI tools use console
      "no-process-exit": "off", // CLI tools may exit
      "@typescript-eslint/no-explicit-any": "warn", // CLI tools sometimes need any
      "@typescript-eslint/no-require-imports": "warn" // Allow require for CLI compatibility
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".ts", ".js", ".json"],
          moduleDirectory: ["node_modules", ".opencode/node_modules"]
        }
      }
    }
  }
];
