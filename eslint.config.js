export default [
    {
        files: ["js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                localStorage: "readonly",
                navigator: "readonly",
                performance: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                KeyboardEvent: "readonly",
                Blob: "readonly",
                URL: "readonly",
                FileReader: "readonly",
                alert: "readonly",
                confirm: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
            "no-undef": "error",
            "eqeqeq": ["error", "always"]
        }
    }
];
