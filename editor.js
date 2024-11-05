import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { watch } from 'chokidar';

(() => {
	const DEBUG = true; // Set to false to disable debug logs
	const FETCH_AUTH = {};
	const watchs = new Map();

	main();

	/**
	 * Main function
	 * @returns {Promise<void>}
	 */
	async function main() {
		await waitFetchFile();
		parseFetchFile();

		createTemplate();
		watchTemplate();
	}

	/**
	 * Create template.html if not exists
	 * @returns {void}
	 */
	function createTemplate() {
		const templatePath = join(__dirname, 'template.html');
		if (!existsSync(templatePath)) {
			writeFileSync(
				templatePath,
				`<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdfset>
	<pdf>
		<head>
		</head>
		<body size="Letter">
			<h1>Hello World</h1>
		</body>
	</pdf>
</pdfset>`
			);
			log('template.html created');
		}
	}

	/**
	 * Watch for changes in template.html
	 * @returns {void}
	 */
	function watchTemplate() {
		const templatePath = join(__dirname, 'template.html');

		// watch for changes in template.html
		if (!watchs.has('template.html')) {
			const watchTemplateFile = watch(templatePath).on('change', () => {
				log('template.html has changed');
				const template = readFileSync(templatePath, 'utf-8');
				sendTemplate(template);
			});

			watchs.set('template.html', watchTemplateFile);
		}
	}

	/**
	 * Send template to server
	 * @param {string} template
	 * @returns {void}
	 */
	function sendTemplate(template) {
		const body = makeBody(FETCH_AUTH.body, template);
		const fetchFunction = FETCH_AUTH.function.replace('%BODY%', body);

		const fetchFunctionWithBody = new Function(fetchFunction.replace('fetch', 'return fetch'));
		fetchFunctionWithBody().then((response) => {
			if (response.ok) {
				log('Template sent successfully', 'info');
			} else {
				log('Error sending template', 'error');
			}
		});
	}

	/**
	 * Wait for .fetch file to be created or changed
	 * @returns {Promise<void>}
	 */
	function waitFetchFile() {
		return new Promise((resolve) => {
			const fetchFilePath = join(__dirname, '.fetch');
			if (!existsSync(fetchFilePath)) {
				writeFileSync(fetchFilePath, '');
				log('.fetch file created');
			}

			const fetchFile = readFileSync(fetchFilePath, 'utf-8');
			if (fetchFile.match(/fetch/)) {
				resolve();
			}

			if (!watchs.has('.fetch')) {
				const watchFetchFile = watch(fetchFilePath).on('change', () => {
					const fetchFile = readFileSync(fetchFilePath, 'utf-8');
					if (fetchFile.match(/fetch/)) {
						log('fetch file has changed');
						resolve();

						// Reload main function
						if (watchs.has('template.html')) {
							main();
						}
					}
				});

				watchs.set('.fetch', watchFetchFile);
			}
		});
	}

	/**
	 * Parse .fetch file to get fetch function and body params
	 * @returns {void}
	 */
	function parseFetchFile() {
		const fetchFilePath = join(__dirname, '.fetch');
		const fetchFile = readFileSync(fetchFilePath, 'utf-8');

		const fetchFunction = fetchFile.replace(/"body":\s*"(.*)"/, 'body: "%BODY%"');

		// Parse body params post request to object
		const bodyParams = fetchFile.match(/"body":\s*"(.*)"/)[1];
		const bodyObject = parseRequestBody(bodyParams);

		FETCH_AUTH.function = fetchFunction;
		FETCH_AUTH.body = bodyObject;
	}

	/**
	 * Parse body params from post request to object
	 * @param {string} body
	 * @returns {object}
	 */
	function parseRequestBody(body) {
		const bodyParams = body.split('&');
		const bodyObject = {};

		bodyParams.forEach((param) => {
			const [key, value] = param.split('=');
			bodyObject[key] = decodeURIComponent(value);
		});

		return bodyObject;
	}

	/**
	 * Make body params encoded for post request
	 * @param {object} body
	 * @param {string} template
	 * @returns {string}
	 */
	function makeBody(body, template) {
		const newBodyObject = {
			...body,
			template: template,
			'source-template': '',
			'wysiwyg-template': '',
		};

		const bodyParamsEncoded = Object.keys(newBodyObject)
			.map((key) => `${key}=${encodeURIComponent(newBodyObject[key])}`)
			.join('&');

		return bodyParamsEncoded;
	}

	/**
	 * Log message
	 * @param {string} message
	 * @param {'debug' | 'info' | 'error'} type
	 * @returns {void}
	 */
	function log(message, type = 'debug') {
		if (type === 'debug' && !DEBUG) return;

		const date = new Date().toLocaleString('fr-FR');
		if (type === 'error') {
			console.error(`[${date}] [ERROR] ${message}`);
		} else {
			console.log(`[${date}] [INFO] ${message}`);
		}
	}
})();
