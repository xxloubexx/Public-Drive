// End-to-end: starts the real server and exercises every route, so a broken dependency fails here.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { port, adminPath } = require('../config.json');

const BASE = `http://localhost:${port}`;
const ADMIN = BASE + adminPath;
const PUBLIC = path.join(__dirname, '..', 'public');
const DIR = `test-${Date.now()}`;
const DIR2 = `${DIR}-renamed`;
let server;

before(() => new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')]);
    const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
    server.stdout.on('data', (d) => { if (d.includes('Server started')) { clearTimeout(timer); resolve(); } });
    server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
}));

after(() => {
    server.kill();
    for (const d of [DIR, DIR2]) fs.rmSync(path.join(PUBLIC, d), { recursive: true, force: true });
});

const form = (route, fields) => fetch(ADMIN + route, { method: 'POST', body: new URLSearchParams(fields) });

function upload(name, content) {
    const fd = new FormData();
    fd.append('currentFolder', DIR); // must come before the file part
    fd.append('fileUpload', new Blob([content]), name);
    return fetch(`${ADMIN}/upload-file`, { method: 'POST', body: fd });
}

test('home and admin pages render', async () => {
    for (const url of [BASE + '/', ADMIN]) {
        const res = await fetch(url);
        assert.strictEqual(res.status, 200, url);
        assert.match(await res.text(), /<html/);
    }
});

test('creates a folder', async () => {
    const res = await form('/create-folder', { folderName: DIR });
    assert.strictEqual(res.status, 200);
    assert.ok(fs.existsSync(path.join(PUBLIC, DIR)));
    assert.ok((await (await fetch(BASE + '/')).text()).includes(DIR));
});

test('uploads files and hides excluded ones', async () => {
    for (const [name, content] of [['hello.txt', 'hello world'], ['doc.pdf', '%PDF-1.4'], ['evil.exe', 'x']]) {
        assert.strictEqual((await upload(name, content)).status, 200, name);
    }
    const page = await (await fetch(`${BASE}/folder/${DIR}`)).text();
    assert.ok(page.includes('hello.txt') && page.includes('doc.pdf'));
    assert.ok(!page.includes('evil.exe'));
    assert.strictEqual((await fetch(`${BASE}/file/${DIR}/evil.exe`)).status, 404);
});

test('views txt and pdf, serves raw file', async () => {
    for (const name of ['hello.txt', 'doc.pdf']) {
        const res = await fetch(`${BASE}/file/${DIR}/${name}`);
        assert.strictEqual(res.status, 200, name);
        assert.ok((await res.text()).includes(name));
    }
    assert.strictEqual(await (await fetch(`${BASE}/${DIR}/hello.txt`)).text(), 'hello world');
});

test('searches by filename and content', async () => {
    for (const [query, searchType] of [['hello', 'filename'], ['world', 'content']]) {
        const res = await fetch(`${BASE}/api/search?query=${query}&searchType=${searchType}&folder=${DIR}`);
        const { files } = await res.json();
        assert.ok(files.some((f) => f.includes('hello.txt')), searchType);
    }
});

test('blocks path traversal outside public/', async () => {
    for (const url of ['/file/..%2Fserver.js', '/folder/..%2F..', `${adminPath}/folder/..%2F..`]) {
        assert.strictEqual((await fetch(BASE + url)).status, 404, url);
    }
    const res = await fetch(`${BASE}/api/search?query=server&searchType=filename&folder=..`);
    assert.strictEqual(res.status, 400);
});

test('renames and deletes a file', async () => {
    await form('/rename-file', { oldFileName: 'hello.txt', newFileName: 'bye', currentFolder: DIR });
    assert.ok(fs.existsSync(path.join(PUBLIC, DIR, 'bye.txt')), 'keeps extension');

    await form('/delete-file', { fileName: 'bye.txt', currentFolder: DIR });
    assert.ok(!fs.existsSync(path.join(PUBLIC, DIR, 'bye.txt')));
});

test('renames and deletes a folder, never the root', async () => {
    await form('/rename-folder', { oldFolderName: DIR, newFolderName: DIR2 });
    assert.ok(fs.existsSync(path.join(PUBLIC, DIR2)));

    assert.strictEqual((await form('/delete-folder', { folderName: '' })).status, 400);
    await form('/delete-folder', { folderName: DIR2 });
    assert.ok(!fs.existsSync(path.join(PUBLIC, DIR2)));
});

// Must stay last: it exhausts the per-IP quota for the rest of the run.
test('rate limits floods', async () => {
    let status;
    for (let i = 0; i < 400 && status !== 429; i++) status = (await fetch(BASE + '/')).status;
    assert.strictEqual(status, 429);
});
