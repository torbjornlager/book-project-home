#!/usr/bin/env python3
"""Build or verify the static Genealogist deployment; never fetches or publishes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

APP_FILES = ('index.html', 'genealogist.css', 'genealogist.js', 'genealogist.pl')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inventory(root):
    return {p.relative_to(root).as_posix(): digest(p) for p in sorted(root.rglob('*'))
            if p.is_file() and p != root / 'deployment.json'}

def verify(root):
    root = Path(root).resolve()
    manifest = json.loads((root / 'deployment.json').read_text())
    if any(p.is_symlink() for p in root.rglob('*')):
        raise ValueError('Published files must not be symlinks')
    if inventory(root) != manifest['files']:
        raise ValueError('Deployment inventory or checksums differ')
    return manifest

def build(experiment, package, output, kind='genealogist', working_tree=False, development_runtime=False):
    if kind not in ('genealogist', 'genealogist-main', 'studio', 'boxshop'):
        raise ValueError('Unknown experiment kind')
    studio = kind == 'studio'
    boxshop = kind == 'boxshop'
    if studio:
        app_files = ('index.html', 'studio.css', 'studio.js', 'CODEMIRROR-LICENSE.txt')
        script_name, title = 'studio.js', 'Trinity Studio'
    elif boxshop:
        app_files = ('index.html', 'boxshop.css', 'boxshop.js', 'voice.js',
                     'boxshop.pl', 'boxshop-2.xml', 'boxshop-voice.xml')
        script_name, title = 'boxshop.js', 'The Box Shop'
    else:
        app_files = APP_FILES
        if kind == 'genealogist-main':
            app_files += ('genealogist_ui.pl',)
        script_name = 'genealogist.js'
        title = 'The Genealogist' + (' (Main thread + DOM)' if kind == 'genealogist-main' else '')
    experiment, package, output = map(lambda p: Path(p).resolve(), (experiment, package, output))
    if output.exists():
        raise ValueError('Use a fresh output directory; review replacements explicitly')
    repo = experiment.parents[1]
    relative = experiment.relative_to(repo).as_posix()
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()
    if not working_tree and git('status', '--porcelain', '--', relative):
        raise ValueError('Commit the experiment before packaging it')
    revision = git('rev-parse', 'HEAD')
    # Require the actual committed source bytes, even for ignored/local inputs.
    sources = {}
    for name in app_files:
        if working_tree:
            sources[name] = (experiment / name).read_bytes()
            continue
        data = subprocess.check_output(['git', '-C', str(repo), 'show', revision + ':' + relative + '/' + name])
        if data != (experiment / name).read_bytes():
            raise ValueError('Source differs from commit: ' + name)
        sources[name] = data
    if boxshop:
        chart_path = 'examples/statecharts/12 boxshop-2.xml'
        chart = subprocess.check_output(['git', '-C', str(repo), 'show', revision + ':' + chart_path])
        if sources['boxshop-2.xml'] != chart:
            raise ValueError('The Box Shop must use the original boxshop-2.xml unchanged')
    if b'"/runtime/' in sources['index.html'] or b"new URL('/runtime/" in sources[script_name]:
        raise ValueError('The experiment must use page-relative runtime URLs')
    editor_files = {}
    if studio:
        for name in ('codemirror.min.css', 'codemirror.min.js'):
            relative_file = 'web/vendor/' + name
            data = subprocess.check_output(['git', '-C', str(repo), 'show', revision + ':' + relative_file])
            if data != (repo / relative_file).read_bytes():
                raise ValueError('Editor differs from commit: ' + name)
            editor_files[name] = data
        if b'5.65.16' not in editor_files['codemirror.min.js']:
            raise ValueError('Review editor version and license before upgrading')
    upstream = json.loads((package / 'manifest.json').read_text())
    if upstream['name'] != 'swi-wasm-node' or (upstream['source'].get('dirty') and not development_runtime):
        raise ValueError('Use a clean swi-wasm-node release package')
    for name, expected in upstream['files'].items():
        file = (package / name).resolve()
        if not file.is_relative_to(package) or digest(file) != expected:
            raise ValueError('Runtime package checksum mismatch: ' + name)
    web_files = {p.relative_to(package).as_posix(): digest(p)
                 for p in sorted((package / 'web').rglob('*')) if p.is_file()}
    if web_files != {name: sha for name, sha in upstream['files'].items() if name.startswith('web/')}:
        raise ValueError('Runtime web tree contains missing or unlisted files')
    output.mkdir(parents=True)
    for name, data in sources.items():
        (output / name).write_bytes(data)
    shutil.copy2(repo / 'LICENSE', output / 'LICENSE')
    shutil.copytree(package / 'web', output / 'runtime')
    for name, data in editor_files.items():
        (output / 'runtime' / 'vendor' / name).write_bytes(data)
    shutil.copy2(package / 'LICENSE', output / 'runtime' / 'LICENSE')
    licenses = output / 'runtime' / 'third_party'
    licenses.mkdir()
    shutil.copy2(package / 'third_party' / 'LICENSE.txt', licenses / 'LICENSE.txt')
    (output / 'ABOUT.txt').write_text(
        title + ': a browser-only Web Prolog experiment.\n' +
        ('Application source: local working-tree snapshot of ' + relative + ', based on ' + revision + '\n' if working_tree else
         'Application source: https://github.com/torbjornlager/trinity-demonstrator/tree/' + revision + '/' + relative + '\n') +
        'Runtime source: ' + ('development snapshot based on ' if upstream['source'].get('dirty') else '') +
        'https://github.com/torbjornlager/swi-wasm-node/tree/' + upstream['source']['revision'] + '\n'
        'The Prolog database belongs to this page and is not sent to a server.\n' +
        ('Browser speech recognition is required and may use an external browser service.\n'
         'Orders are demonstration data only; nothing is purchased or stored.\n' if boxshop else
         'Save source before closing or reloading. No automatic persistence.\n' if studio else
         'Save Prolog before closing or reloading. No automatic persistence.\n') +
        'Application/runtime licenses: LICENSE, runtime/LICENSE, runtime/third_party/LICENSE.txt\n'
        'Rebuild instructions: ../README.md and ../tools/package_' + kind.replace('-', '_') + '.py\n' +
        ('Editor license: CODEMIRROR-LICENSE.txt (CodeMirror 5.65.16).\n' if studio else ''))
    deployment = dict(format=1, application=dict(repository='torbjornlager/trinity-demonstrator',
                      revision=revision, path=relative),
                      runtime=dict(repository='torbjornlager/swi-wasm-node',
                      revision=upstream['source']['revision'], version=upstream['version'],
                      manifest_sha256=digest(package / 'manifest.json'), engine=upstream['engine']),
                      files=inventory(output))
    if studio:
        deployment['editor'] = dict(name='CodeMirror', version='5.65.16', source_revision=revision,
                                    files={name: hashlib.sha256(data).hexdigest() for name, data in editor_files.items()})
    if boxshop:
        deployment['chart'] = dict(path=chart_path,
                                   sha256=hashlib.sha256(chart).hexdigest(),
                                   running='boxshop-voice.xml')
    if working_tree:
        deployment['application']['working_tree'] = True
        deployment['application']['source_files'] = {name: hashlib.sha256(data).hexdigest() for name, data in sources.items()}
    if upstream['source'].get('dirty'):
        deployment['runtime']['development'] = True
    (output / 'deployment.json').write_text(json.dumps(deployment, indent=2, sort_keys=True) + '\n')
    return verify(output)

def main(kind='genealogist'):
    descriptions = {
        'studio': 'Build or verify the static Trinity Studio deployment; never fetches or publishes.',
        'boxshop': 'Build or verify the static Box Shop deployment; never fetches or publishes.',
    }
    parser = argparse.ArgumentParser(description=descriptions.get(kind, __doc__))
    parser.add_argument('--experiment-root', type=Path)
    parser.add_argument('--runtime-package', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify', type=Path)
    parser.add_argument('--working-tree', action='store_true', help='Preview uncommitted application source; record source hashes and working-tree provenance')
    parser.add_argument('--development-runtime', action='store_true', help='Preview a checksummed uncommitted runtime; mark it as a development snapshot')
    args = parser.parse_args()
    try:
        if args.verify:
            result = verify(args.verify)
        elif args.experiment_root and args.runtime_package and args.output:
            result = build(args.experiment_root, args.runtime_package, args.output, kind=kind, working_tree=args.working_tree, development_runtime=args.development_runtime)
        else:
            parser.error('Use --verify DIRECTORY or supply all three build paths')
        print(json.dumps(dict(application=result['application'], runtime_revision=result['runtime']['revision'], files=len(result['files'])), indent=2))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')

if __name__ == '__main__':
    main()
