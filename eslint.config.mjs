import { defineConfig } from "eslint/config";
import config from "eslint-config-webpack";

export default defineConfig([
	{
		ignores: ["benchmark/"],
	},
	{
		extends: [config],
		rules: {
			"prefer-spread": "off",
			"unicorn/prefer-spread": "off",
			"prefer-rest-params": "off",
		},
	},
]);
