import { defineConfig } from "eslint/config";
import config from "eslint-config-webpack";

export default defineConfig([
	{
		extends: [config],
		rules: {
			"prefer-spread": "off",
			"unicorn/prefer-spread": "off",
			"prefer-rest-params": "off",
			"n/prefer-node-protocol": "off",
		},
	},
]);
