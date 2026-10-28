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

def build(experiment, package, output):
    experiment, package, output = map(lambda p: Path(p).resolve(), (experiment, package, output))
    if output.exists():
        raise ValueError('Use a fresh output directory; review replacements explicitly')
    repo = experiment.parents[1]
    relative = experiment.relative_to(repo).as_posix()
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()
    if git('status', '--porcelain', '--', relative):
        raise ValueError('Commit the experiment before packaging it')
    revision = git('rev-parse', 'HEAD')
    # Require the actual committed source bytes, even for ignored/local inputs.
    sources = {}
    for name in APP_FILES:
        data = subprocess.check_output(['git', '-C', str(repo), 'show', revision + ':' + relative + '/' + name])
        if data != (experiment / name).read_bytes():
            raise ValueError('Source differs from commit: ' + name)
        sources[name] = data
    if b'"/runtime/' in sources['index.html'] or b"new URL('/runtime/" in sources['genealogist.js']:
        raise ValueError('The experiment must use page-relative runtime URLs')
    upstream = json.loads((package / 'manifest.json').read_text())
    if upstream['name'] != 'swi-wasm-node' or upstream['source'].get('dirty'):
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
    shutil.copy2(package / 'LICENSE', output / 'runtime' / 'LICENSE')
    licenses = output / 'runtime' / 'third_party'
    licenses.mkdir()
    shutil.copy2(package / 'third_party' / 'LICENSE.txt', licenses / 'LICENSE.txt')
    (output / 'ABOUT.txt').write_text(
        'The Genealogist: a browser-only Web Prolog experiment.\n'
        'Application source: https://github.com/torbjornlager/trinity-demonstrator/tree/' + revision + '/' + relative + '\n'
        'Runtime source: https://github.com/torbjornlager/swi-wasm-node/tree/' + upstream['source']['revision'] + '\n'
        'The Prolog database belongs to this page and is not sent to a server.\n'
        'Save Prolog before closing or reloading. No automatic persistence.\n'
        'Application/runtime licenses: LICENSE, runtime/LICENSE, runtime/third_party/LICENSE.txt\n'
        'Rebuild instructions: ../README.md and ../tools/package_genealogist.py\n')
    deployment = dict(format=1, application=dict(repository='torbjornlager/trinity-demonstrator',
                      revision=revision, path=relative),
                      runtime=dict(repository='torbjornlager/swi-wasm-node',
                      revision=upstream['source']['revision'], version=upstream['version'],
                      manifest_sha256=digest(package / 'manifest.json'), engine=upstream['engine']),
                      files=inventory(output))
    (output / 'deployment.json').write_text(json.dumps(deployment, indent=2, sort_keys=True) + '\n')
    return verify(output)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment-root', type=Path)
    parser.add_argument('--runtime-package', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    try:
        if args.verify:
            result = verify(args.verify)
        elif args.experiment_root and args.runtime_package and args.output:
            result = build(args.experiment_root, args.runtime_package, args.output)
        else:
            parser.error('Use --verify DIRECTORY or supply all three build paths')
        print(json.dumps(dict(application=result['application'], runtime_revision=result['runtime']['revision'], files=len(result['files'])), indent=2))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')

if __name__ == '__main__':
    main()
