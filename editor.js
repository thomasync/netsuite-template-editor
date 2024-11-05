import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { watch } from 'chokidar';

(async () => {
	const DEBUG = true; // Set to false to disable debug logs
	const SHOW_PREVIEW = true; // Set to false to disable preview
	const FETCH_AUTH = {};
	const watchs = new Map();

	await checkVersion();
	main();

	/**
	 * Main function
	 * @returns {Promise<void>}
	 */
	async function main() {
		await waitFetchFile();
		parseFetchFile();

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
		createTemplate();

		const templatePath = join(__dirname, 'template.html');

		// watch for changes in template.html
		if (!watchs.has('template.html')) {
			log('Waiting for template.html changes...', 'info');
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
		const fetchFunction = FETCH_AUTH.function.replace('%BODY%', body).replace('fetch', 'return fetch');

		const fetchFunctionWithBody = new Function(fetchFunction);
		fetchFunctionWithBody().then((response) => {
			if (response.ok) {
				log('Template sent successfully', 'info');
				if (SHOW_PREVIEW) {
					getPreview(fetchFunction);
				}
			} else {
				log('Error sending template', 'error');
			}
		});
	}

	function getPreview(fetchFunction) {
		const fetchFunctionWithBody = new Function(fetchFunction.replace('action=SAVE_EDIT', 'action=PREVIEW'));
		fetchFunctionWithBody().then(async (response) => {
			if (response.ok) {
				log('Preview fetched successfully', 'info');
				const preview = await response.arrayBuffer();
				writeFileSync(join(__dirname, 'preview.pdf'), Buffer.from(preview));
			} else {
				log('Error getting preview', 'error');
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
			console.log(`[${date}] [${type.toUpperCase()}] ${message}`);
		}
	}

	/**
	 * Verify latest version
	 */
	async function checkVersion() {
		const { version } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
		const response = await fetch(
			'https://raw.githubusercontent.com/thomasync/netsuite-template-editor/refs/heads/main/package.json'
		);
		const { version: latestVersion } = await response.json();

		if (version !== latestVersion) {
			log(`New version available: ${latestVersion}`, 'info');
			log('Execute `git pull` to update', 'info');
		} else {
			log(`Latest version: ${version}`, 'info');
		}
	}
})();
