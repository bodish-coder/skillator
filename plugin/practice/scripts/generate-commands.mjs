#!/usr/bin/env node
// Offline authoring tool. Installers consume the committed outputs without Node.
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
const hosts = ['cursor', 'pi', 'opencode', 'antigravity', 'gemini'];
const read = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
const namePattern = /^[a-z][a-z0-9-]*$/;
function name(value) {
  if (typeof value !== 'string' || !namePattern.test(value)) throw new Error(`Invalid command name: ${value}`);
}
function command(text, source) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`Missing command frontmatter: ${source}`);
  const description = /^description: (.+)$/m.exec(match[1])?.[1];
  const hint = /^argument-hint: (.+)$/m.exec(match[1])?.[1];
  if (!description) throw new Error(`Missing description: ${source}`);
  return { description, hint, body: match[2].trim() };
}

// A section's default remains readable by Claude; only host-specific sections
// are replaced. Common instructions always come from the canonical Markdown.
function sections(body, commandName, host, metadata, used) {
  const seen = new Set();
  body = body.replace(/<!-- host-section:([a-z-]+) -->\n?([\s\S]*?)\n?<!-- \/host-section:\1 -->/g, (_, section, original) => {
    const key = `${commandName}.${section}`;
    if (seen.has(key)) throw new Error(`Duplicate section: ${key}`);
    seen.add(key);
    used.add(key);
    const variants = metadata.sections[key];
    if (!variants) throw new Error(`Missing section metadata: ${key}`);
    return variants[host] ?? variants.all ?? original;
  });
  if (body.includes('host-section:')) throw new Error(`Malformed section: ${commandName}`);
  return body;
}
function substitute(body, host) {
  // These substitutions are deliberately narrow: the quoted code-yoda directive
  // names a skill namespace inside a larger instruction and must remain intact.
  body = body.replace(/\(`?skillator:([a-z0-9-]+)`?\)/g, '({{SKILLS}}/$1/SKILL.md)')
    .replace(/`skillator:([a-z0-9-]+)`/g, '`{{SKILLS}}/$1/SKILL.md`')
    .replace(/\bskills\/(?=[a-z])/g, '{{SKILLS}}/')
    .replaceAll(' (`$PRACTICE` resolved as that skill says)', '')
    .replaceAll('$PRACTICE', '{{SKILLS}}/practice');
  if (host === 'gemini') body = body.replaceAll('$ARGUMENTS', '{{args}}');
  if (host === 'cursor' || host === 'antigravity') {
    body = body.replaceAll('`$ARGUMENTS`', 'the words typed after the command').replaceAll('$ARGUMENTS', '<args>');
  }
  for (const token of body.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (token[1] !== 'SKILLS' && !(host === 'gemini' && token[1] === 'args')) throw new Error(`Unknown substitution: ${token[0]}`);
  }
  return body;
}

export function renderCommands(root = defaultRoot) {
  const metadata = JSON.parse(read(join(root, 'commands/hosts.json')));
  const outputs = new Map();
  const used = new Set();
  function add(path, text) {
    if (outputs.has(path)) throw new Error(`Duplicate output path: ${path}`);
    for (const token of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
      if (token[1] !== 'SKILLS' && !(path.startsWith('host-commands/gemini/') && token[1] === 'args')) throw new Error(`Unknown substitution in ${path}: ${token[0]}`);
    }
    outputs.set(path, text);
  }
  for (const entry of metadata.commands) {
    name(entry.name);
    for (const alias of entry.aliases) name(alias);
    const source = entry.source ?? `${entry.name}.md`;
    if (!/^[a-z][a-z0-9-]*\.(md|txt)$/.test(source)) throw new Error(`Invalid source path: ${source}`);
    const text = read(join(root, 'commands', source));
    const parsed = command(text, source);
    if (entry.canonicalAliases !== false) {
      for (const alias of entry.aliases) add(`commands/${alias}.md`, text);
    }
    for (const host of entry.hosts) {
      if (!hosts.includes(host)) throw new Error(`Unknown host: ${host}`);
      let sourceBody = sections(parsed.body, entry.name, host, metadata, used);
      if (entry.skillDir) {
        name(entry.skillDir);
        sourceBody = sourceBody.replaceAll('<skill dir>', `{{SKILLS}}/${entry.skillDir}`);
      }
      const body = substitute(sourceBody, host);
      const description = entry.hostDescription ? JSON.stringify(entry.hostDescription) : parsed.description;
      for (const outputName of [entry.name, ...entry.aliases]) {
        if (host === 'gemini') {
          if (body.includes("'''")) throw new Error(`TOML literal delimiter in ${entry.name}`);
          const desc = description.startsWith('"') ? JSON.parse(description) : description;
          add(`host-commands/gemini/${outputName}.toml`, `description = ${JSON.stringify(desc)}\nprompt = '''\n${body}\n'''\n`);
        } else {
          const skill = host === 'antigravity';
          const header = `---\n${skill ? `name: ${outputName}\n` : ''}description: ${description}\n${host === 'pi' && parsed.hint ? `argument-hint: ${parsed.hint}\n` : ''}---\n`;
          add(`host-commands/${host}/${outputName}${skill ? '/SKILL.md' : '.md'}`, `${header}${body}\n`);
        }
      }
    }
  }
  for (const key of Object.keys(metadata.sections)) {
    if (!used.has(key)) throw new Error(`Unused section metadata: ${key}`);
    for (const host of Object.keys(metadata.sections[key])) {
      if (host !== 'all' && !hosts.includes(host)) throw new Error(`Unknown section host: ${host}`);
    }
  }
  return outputs;
}

function stat(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function generate(root, mode) {
  const outputs = renderCommands(root);
  // Preflight every destination before writing anything. Never follow output
  // symlinks or remove unrecognized files/directories.
  for (const path of outputs.keys()) {
    let current = resolve(root);
    const parts = path.split('/');
    for (const [i, part] of parts.entries()) {
      current = join(current, part);
      const info = stat(current);
      if (info && (info.isSymbolicLink() || (i === parts.length - 1 ? !info.isFile() : !info.isDirectory()))) throw new Error(`Unsafe output path: ${path}`);
    }
  }
  const stale = [];
  for (const [path, text] of outputs) {
    const destination = join(root, path);
    if (stat(destination) && readFileSync(destination).equals(Buffer.from(text, 'utf8'))) continue;
    stale.push(path);
    if (mode === '--write') {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, text, 'utf8');
    }
  }
  return { stale, count: outputs.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, flag, root, ...extra] = process.argv.slice(2);
    if (!['--check', '--write'].includes(mode) || (flag && flag !== '--root') || (flag && !root) || extra.length) throw new Error('Usage: node generate-commands.mjs --check|--write [--root <plugin directory>]');
    const result = generate(root ? resolve(root) : defaultRoot, mode);
    if (mode === '--check' && result.stale.length) {
      console.error(result.stale.map(path => `Stale generated command: ${path}`).join('\n'));
      process.exitCode = 1;
    } else console.log(`${result.count} generated commands checked; ${mode === '--write' ? result.stale.length : 0} written.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
