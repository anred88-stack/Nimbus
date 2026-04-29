"""One-shot: re-write every fixture's _metadata.tolerance to the
per-source-class default in run_scenario.py without re-running GeoClaw.
"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / 'src' / 'physics' / 'validation' / 'geoclawFixtures'
SCENARIO_FILE = Path(__file__).parent / 'scenarios.json'

DEFAULT_TOLERANCE_BY_TYPE = {
    'seismic-megathrust': 2.0,
    'volcanic-collapse': 4.0,
    'submarine-landslide': 2.0,
    'impact-deep-ocean': 4.0,
}

scenarios_by_id = {
    s['id']: s
    for s in json.loads(SCENARIO_FILE.read_text(encoding='utf-8'))['scenarios']
}

for fp in sorted(FIXTURE_DIR.glob('*.json')):
    fix = json.loads(fp.read_text(encoding='utf-8'))
    sid = fix['scenarioId']
    src_type = fix['input']['type']
    scenario = scenarios_by_id.get(sid, {})
    new_tol = scenario.get(
        '_tolerance', DEFAULT_TOLERANCE_BY_TYPE.get(src_type, 0.5)
    )
    new_rat = scenario.get(
        '_toleranceRationale',
        f'Per-source-class default for {src_type}. '
        'See scripts/geoclaw/run_scenario.py DEFAULT_TOLERANCE_BY_TYPE for the '
        'rationale (Synolakis 2008 inter-model spread + closed-form vs '
        '2D-AMR mismatch + source-model scatter).',
    )
    fix['_metadata']['tolerance'] = new_tol
    fix['_metadata']['tolerationRationale'] = new_rat
    fp.write_text(json.dumps(fix, indent=2), encoding='utf-8')
    print(f'  {sid}: type={src_type} tol={new_tol}')
