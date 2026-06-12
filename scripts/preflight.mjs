// scripts/preflight.mjs — verifies package version and CHANGELOG header agree before publish.
// Fails fast if package.json.version is missing from CHANGELOG.md so we cannot ship a VSIX
// whose release notes do not mention the version being published.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)

/** Read package.json and return its version string. */
function readVersion() {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
	if (!pkg.version || typeof pkg.version !== 'string') {
		throw new Error('package.json is missing a version string.')
	}
	return pkg.version
}

/** Read CHANGELOG.md and return all version headers found. */
function readChangelogVersions() {
	const md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
	const versions = []
	for (const line of md.split('\n')) {
		// Match "## [X.Y.Z]" or "## X.Y.Z" with optional date suffix.
		const m = line.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?/)
		if (m) versions.push(m[1])
	}
	return versions
}

const version = readVersion()
const changelogVersions = readChangelogVersions()

if (!changelogVersions.includes(version)) {
	console.error(`Preflight failed: package.json version ${version} is not present in CHANGELOG.md.`)
	console.error(`CHANGELOG.md contains versions: ${changelogVersions.join(', ') || '(none)'}`)
	process.exit(1)
}

console.log(`Preflight ok: version ${version} is documented in CHANGELOG.md.`)
