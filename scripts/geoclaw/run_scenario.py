"""
Tier-3 GeoClaw fixture driver.

Usage:
    python run_scenario.py <scenario-id> [--dest <fixture-out-path>]

Reads `scenarios.json`, builds a working directory under /root/work/,
generates the appropriate source (Okada dtopo for seismic, Gaussian
qinit for volcanic/landslide/impact), runs `make .output`, then writes
the JSON fixture into
    src/physics/validation/geoclawFixtures/<scenario-id>.json

Designed to run inside the WSL2 Ubuntu venv created by docs/GEOCLAW_SETUP.md
with $CLAW pointing at the cloned clawpack source tree.

Source-type handling:
- seismic-megathrust: single-subfault Okada dtopo from M0-derived mean slip
  if not provided (Hanks-Kanamori 1979) using rupture geometry.
- volcanic-collapse: Gaussian surface-displacement qinit centred on the
  source, peak from Watts 2000 subaerial / caldera coefficient × V^(1/3).
- submarine-landslide: same Gaussian shape, peak from Watts 2000
  submarine coefficient.
- impact-deep-ocean: Gaussian peak from Ward-Asphaug 2000 cavity radius
  with the Phase-18 ocean-coupling-corrected linearly damped η formula.

Tolerance and rationale live in the JSON `_metadata` block.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCENARIO_FILE = Path(__file__).parent / 'scenarios.json'
FIXTURE_DIR = REPO_ROOT / 'src' / 'physics' / 'validation' / 'geoclawFixtures'
WORK_ROOT = Path('/root/work')
TEMPLATE = Path(__file__).parent / 'setrun_template.py'
CLAW = Path(os.environ.get('CLAW', '/root/clawpack-src'))

# Standard topo file for global ETOPO 10' coverage. We use the same one the
# chile2010 example downloads and cache it in $CLAW/geoclaw/scratch/.
GLOBAL_TOPO = CLAW / 'geoclaw' / 'scratch' / 'etopo10min120W60W60S0S.asc'
GLOBAL_TOPO_URL = 'http://depts.washington.edu/clawpack/geoclaw/topo/etopo/etopo10min120W60W60S0S.asc'

# Constants
G = 9.81
SEAWATER_DENSITY = 1025.0
EARTH_RADIUS_M = 6371000.0
RIGIDITY_PA = 30e9
WARD_REFERENCE_CAVITY_M = 3000.0


def haversine_m(lat1, lon1, lat2, lon2):
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def magnitude_to_M0(Mw: float) -> float:
    """Hanks-Kanamori 1979."""
    return 10 ** (1.5 * Mw + 9.05)


def ensure_topo():
    if GLOBAL_TOPO.exists():
        return
    print(f'Downloading {GLOBAL_TOPO_URL}...')
    import urllib.request

    GLOBAL_TOPO.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(GLOBAL_TOPO_URL, GLOBAL_TOPO)


def build_dtopo(scenario, out_path: Path):
    """Generate Okada dtopo using clawpack.geoclaw.dtopotools.SubFault."""
    from clawpack.geoclaw import dtopotools
    import numpy as np

    inp = scenario['input']
    sub = dtopotools.SubFault()
    sub.strike = inp.get('strikeDeg', 0.0)
    sub.length = inp['ruptureLengthM']
    sub.width = inp['ruptureWidthM']
    sub.depth = inp.get('depthM', 25e3)
    if 'meanSlipM' in inp:
        sub.slip = inp['meanSlipM']
    else:
        M0 = magnitude_to_M0(inp['magnitude'])
        sub.slip = M0 / (RIGIDITY_PA * inp['ruptureLengthM'] * inp['ruptureWidthM'])
    sub.rake = inp.get('rakeDeg', 90.0)
    sub.dip = inp.get('dipDeg', 12.0)
    sub.longitude = inp['centroidLon']
    sub.latitude = inp['centroidLat']
    sub.coordinate_specification = 'centroid'

    fault = dtopotools.Fault()
    fault.subfaults = [sub]
    print(f'  Subfault Mw = {fault.Mw():.3f} (target {inp["magnitude"]:.2f})')

    # 1° pad around the fault box, 50 km grid (~0.5°). For fixture-grade
    # accuracy this is plenty since the fault is the source, not a detail
    # we need to resolve.
    L_deg = inp['ruptureLengthM'] / 111000.0
    half = max(L_deg / 2.0 + 1.0, 2.0)
    x = np.linspace(inp['centroidLon'] - half, inp['centroidLon'] + half, 80)
    y = np.linspace(inp['centroidLat'] - half, inp['centroidLat'] + half, 80)
    fault.create_dtopography(x, y, [1.0])
    fault.dtopo.write(str(out_path), dtopo_type=3)
    return fault.Mw()


def build_qinit(scenario, out_path: Path):
    """Write a Gaussian-eta qinit XYZ file (lon, lat, eta) for non-seismic."""
    import numpy as np

    inp = scenario['input']
    src_type = inp['type']
    lon0 = inp['centroidLon']
    lat0 = inp['centroidLat']

    if src_type == 'volcanic-collapse':
        slope = inp.get('slopeRad', math.atan(0.05))
        peak_m = 0.4 * inp['collapseVolumeM3'] ** (1 / 3) * math.sin(slope)
        sigma_m = (
            math.sqrt(inp['collapseAreaM2']) / 2
            if 'collapseAreaM2' in inp
            else 5_000.0
        )
    elif src_type == 'submarine-landslide':
        slope = inp.get('slopeRad', math.atan(0.05))
        peak_m = 0.005 * inp['slideVolumeM3'] ** (1 / 3) * math.sin(slope)
        sigma_m = (
            inp['slideLengthM'] / 4 if 'slideLengthM' in inp else 50_000.0
        )
    elif src_type == 'impact-deep-ocean':
        rho_i = inp['impactorDensityKgPerM3']
        D = inp['impactorDiameterM']
        v = inp['impactorVelocityMPerS']
        mass = (math.pi / 6) * rho_i * D ** 3
        keJ = 0.5 * mass * v ** 2
        # Ward-Asphaug 2000 cavity: R_C = (E / (rho_w * g)) ** (1/4)
        R_C = (keJ / (SEAWATER_DENSITY * G)) ** 0.25
        # Phase-18 linearly damped η formula
        peak_m = (0.5 * R_C * WARD_REFERENCE_CAVITY_M) / (
            WARD_REFERENCE_CAVITY_M + R_C
        )
        sigma_m = R_C
    else:
        raise ValueError(f'unsupported qinit source type: {src_type}')

    print(f'  qinit peak={peak_m:.2f} m, sigma={sigma_m / 1000:.1f} km')

    # Convert sigma from metres to degrees (rough lat-cosine correction)
    deg_per_m_lat = 1.0 / 111000.0
    deg_per_m_lon = 1.0 / (111000.0 * max(math.cos(math.radians(lat0)), 0.1))
    sigma_lat = sigma_m * deg_per_m_lat
    sigma_lon = sigma_m * deg_per_m_lon

    half_deg = max(4 * max(sigma_lat, sigma_lon), 0.5)
    n = 200
    xs = np.linspace(lon0 - half_deg, lon0 + half_deg, n)
    # GeoClaw read_qinit expects rows in NW-to-SE order: top row first
    # (highest lat), going west-to-east, then next row south, etc.
    ys = np.linspace(lat0 + half_deg, lat0 - half_deg, n)

    with open(out_path, 'w') as fh:
        for y in ys:
            for x in xs:
                dlon = (x - lon0) / sigma_lon
                dlat = (y - lat0) / sigma_lat
                eta = peak_m * math.exp(-0.5 * (dlon * dlon + dlat * dlat))
                fh.write(f'{x:.6f} {y:.6f} {eta:.6f}\n')
    return peak_m, sigma_m


def setup_workdir(scenario_id: str) -> Path:
    work = WORK_ROOT / scenario_id
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    # Symlink Makefile and setplot from chile2010 (we only need the build
    # rules; setplot is not used by `make .output`).
    src_example = CLAW / 'geoclaw' / 'examples' / 'tsunami' / 'chile2010'
    for fname in ('Makefile', 'setplot.py'):
        shutil.copy(src_example / fname, work / fname)
    shutil.copy(TEMPLATE, work / 'setrun.py')
    return work


def run_geoclaw(work: Path):
    env = os.environ.copy()
    env['CLAW'] = str(CLAW)
    env['FC'] = 'gfortran'
    t0 = time.time()
    res = subprocess.run(
        ['make', '.output'],
        cwd=work,
        env=env,
        capture_output=True,
        text=True,
    )
    dt = time.time() - t0
    if res.returncode != 0:
        print('STDERR:\n', res.stderr[-2000:])
        raise RuntimeError(f'make .output failed (exit {res.returncode})')
    return dt


def parse_gauge(gauge_path: Path):
    """Return (peakAbsEta, peakTimeS) reading column eta = q[3]."""
    peak = 0.0
    peak_t = 0.0
    with open(gauge_path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            cols = line.split()
            # level, t, h, hu, hv, eta
            if len(cols) < 6:
                continue
            t = float(cols[1])
            eta = float(cols[5])
            if abs(eta) > peak:
                peak = abs(eta)
                peak_t = t
    return peak, peak_t


def get_geoclaw_version_and_commit():
    try:
        import clawpack
        version = getattr(clawpack, '__version__', 'unknown')
    except Exception:
        version = 'unknown'
    commit = 'unknown'
    try:
        commit = subprocess.check_output(
            ['git', '-C', str(CLAW), 'rev-parse', 'HEAD'],
            text=True,
        ).strip()
    except Exception:
        pass
    return version, commit


# Per-source-class fixture tolerance. These reflect the inherent
# scatter between Nimbus's closed-form / 1D-radial pipeline and a 2D
# AMR shallow-water solver for each source class. The Tier-3 pin
# catches order-of-magnitude regressions (NaN, sign flips, missing
# physics); it is not a precision benchmark — the closed-form models
# are operating outside their narrowest-validation envelopes here.
#
# - Megathrust seismic: factor 3 (200 % error). For elongated ruptures
#   (L/W = 2 subduction-megathrust default) the 2D AMR solver radiates
#   strongly perpendicular to strike and weakly along it; Nimbus's
#   1D-radial is isotropic, so far-field amplitudes can be off by
#   factor 2-3 depending on probe azimuth. Synolakis et al. 2008 §6
#   cites ±25-50 % inter-model spread between MOST/GeoClaw/COMCOT on
#   the same NOAA benchmark, but those codes all do 2D AMR; a 1D-radial
#   vs 2D-AMR comparison has wider scatter.
# - Volcanic flank/caldera collapse: factor 5 (400 % error). Watts 2000
#   subaerial / caldera coefficient has factor-3 scatter against
#   observations, plus the 1D-radial vs 2D mismatch.
# - Submarine landslide: factor 3 (200 % error). Watts 2000 submarine
#   coefficient is better constrained; geometric mismatch dominates.
# - Deep-ocean impact: factor 5 (400 % error). Ward-Asphaug cavity
#   model has factor-3 scatter; cavity collapse is a 3D phenomenon
#   that neither 1D-radial nor 2D-AMR shallow-water resolves at the
#   source.
DEFAULT_TOLERANCE_BY_TYPE = {
    'seismic-megathrust': 2.0,
    'volcanic-collapse': 4.0,
    'submarine-landslide': 2.0,
    'impact-deep-ocean': 4.0,
}


def write_fixture(scenario, gauges_data, compute_seconds, dest: Path):
    version, commit = get_geoclaw_version_and_commit()
    lon0 = scenario['input'].get('centroidLon')
    lat0 = scenario['input'].get('centroidLat')
    probes_out = []
    for probe_in, (peak_m, peak_t) in zip(scenario['probes'], gauges_data):
        dist_m = haversine_m(lat0, lon0, probe_in['lat'], probe_in['lon'])
        rec = {
            'label': probe_in['label'],
            'lat': probe_in['lat'],
            'lon': probe_in['lon'],
            'distanceFromEpicentreM': round(dist_m),
            'peakAmplitudeM': round(peak_m, 4),
            'peakTimeSeconds': round(peak_t, 1),
        }
        probes_out.append(rec)

    fixture = {
        'scenarioId': scenario['id'],
        'displayName': scenario['displayName'],
        'geoclawVersion': version,
        'geoclawCommit': commit,
        'computedAt': time.strftime('%Y-%m-%d'),
        'computedBy': 'scripts/geoclaw/run_scenario.py',
        'computedOn': 'WSL2 Ubuntu 22.04, gfortran 11, x86_64',
        'computeSeconds': round(compute_seconds, 1),
        'input': scenario['input'],
        'geoclawProbes': probes_out,
        'publishedReference': scenario.get('publishedReferences', []),
        '_metadata': {
            'schemaVersion': 1,
            'tolerance': scenario.get(
                '_tolerance',
                DEFAULT_TOLERANCE_BY_TYPE.get(scenario['input']['type'], 0.5),
            ),
            'tolerationRationale': scenario.get(
                '_toleranceRationale',
                f'Per-source-class default for {scenario["input"]["type"]}. '
                'See scripts/geoclaw/run_scenario.py DEFAULT_TOLERANCE_BY_TYPE '
                'for the rationale (Synolakis 2008 inter-model spread + '
                'closed-form vs 2D-AMR mismatch + source-model scatter).',
            ),
            'comparisonStrategy': (
                'geoclawComparison.test.ts feeds the fixture input to '
                'deriveSource() (Tier-1 closed form) → simulateSaintVenant1D '
                "in radial geometry → Heidarzadeh-Satake dispersion factor; "
                'asserts ±tolerance vs each geoclawProbes peak.'
            ),
        },
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, 'w') as fh:
        json.dump(fixture, fh, indent=2)
    print(f'  wrote {dest}')


def domain_for(scenario):
    """Use scenarios.json domain block; fall back to a 30°×30° box."""
    if 'domain' in scenario:
        b = scenario['domain']['boundsDeg']
        lower = [b[0], b[2]]
        upper = [b[1], b[3]]
        # 0.5° base grid → cells from extent
        base = scenario['domain'].get('baseGridDeg', 0.5)
        nx = max(20, int(round((b[1] - b[0]) / base)))
        ny = max(20, int(round((b[3] - b[2]) / base)))
        amr = scenario['domain'].get('amrLevels', 2)
        return lower, upper, [nx, ny], amr
    lon0 = scenario['input']['centroidLon']
    lat0 = scenario['input']['centroidLat']
    lower = [lon0 - 15, lat0 - 15]
    upper = [lon0 + 15, lat0 + 15]
    return lower, upper, [60, 60], 2


def domain_fully_covered_by_topo(lower, upper):
    """ETOPO10' tile is 120°W–60°W (-120 ÷ -60), 60°S–0°S (-60 ÷ 0)."""
    return lower[0] >= -120 and upper[0] <= -60 and lower[1] >= -60 and upper[1] <= 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scenario_id')
    ap.add_argument('--dest', type=Path, default=None)
    args = ap.parse_args()

    scenarios = json.loads(SCENARIO_FILE.read_text())['scenarios']
    scenario = next((s for s in scenarios if s['id'] == args.scenario_id), None)
    if scenario is None:
        print(f'unknown scenario: {args.scenario_id}', file=sys.stderr)
        sys.exit(1)
    print(f'=== {scenario["id"]} ({scenario["displayName"]}) ===')

    ensure_topo()

    work = setup_workdir(scenario['id'])

    src_type = scenario['input']['type']
    print(f'  source type: {src_type}')

    if src_type == 'seismic-megathrust':
        dtopo_path = work / 'dtopo.tt3'
        build_dtopo(scenario, dtopo_path)
        source_kw = {'dtopofile': str(dtopo_path)}
    else:
        qinit_path = work / 'qinit.xyz'
        build_qinit(scenario, qinit_path)
        source_kw = {'qinitfile': str(qinit_path)}

    lower, upper, num_cells, amr_levels = domain_for(scenario)

    topofiles = []
    if domain_fully_covered_by_topo(lower, upper):
        topofiles.append([2, str(GLOBAL_TOPO)])
    else:
        # Synthetic flat-ocean fallback as topotype=3 covering the full
        # domain with 1° cells (GeoClaw needs a topo grid that *covers*
        # the simulation extent). One value per cell, rows top-down.
        depth_m = scenario['input'].get('basinDepthM', 4000)
        flat = work / 'flat_basin.tt3'
        cellsize = 1.0
        pad = 2 * cellsize
        x0 = lower[0] - pad
        y0 = lower[1] - pad
        x1 = upper[0] + pad
        y1 = upper[1] + pad
        mx = max(2, int(round((x1 - x0) / cellsize)) + 1)
        my = max(2, int(round((y1 - y0) / cellsize)) + 1)
        with open(flat, 'w') as fh:
            fh.write(f'{mx}\n{my}\n{x0:.6f}\n{y0:.6f}\n{cellsize:.6f}\n-9999\n')
            row = ' '.join(f'{-abs(depth_m):.1f}' for _ in range(mx)) + '\n'
            for _ in range(my):
                fh.write(row)
        topofiles.append([3, str(flat)])

    # Probe distance → tfinal: use shallow-water phase speed √(g·h) with
    # h = 4000 m as worst-case ocean depth (≈ 198 m/s = 713 km/h).
    max_dist_m = 0.0
    for probe in scenario['probes']:
        dist = haversine_m(
            scenario['input']['centroidLat'],
            scenario['input']['centroidLon'],
            probe['lat'],
            probe['lon'],
        )
        max_dist_m = max(max_dist_m, dist)
    tfinal_s = max(9_000.0, max_dist_m / 198.0 * 1.5)

    params = {
        'domain': {
            'lower': lower,
            'upper': upper,
            'num_cells': num_cells,
            'amr_levels': amr_levels,
            'refinement_ratios': [4] * max(amr_levels - 1, 1),
        },
        'tfinal_s': tfinal_s,
        'num_output_times': 30,
        'topofiles': topofiles,
        'gauges': [
            {'id': i + 1, 'lon': p['lon'], 'lat': p['lat']}
            for i, p in enumerate(scenario['probes'])
        ],
    }
    params.update(source_kw)

    (work / '_run_params.json').write_text(json.dumps(params, indent=2))

    # Materialise the .data files via the template
    subprocess.run(
        [sys.executable, 'setrun.py'],
        cwd=work,
        check=True,
        env={**os.environ, 'CLAW': str(CLAW)},
    )

    print('  running make .output ...')
    dt = run_geoclaw(work)
    print(f'  done in {dt:.1f} s')

    gauges_data = []
    for i, _ in enumerate(scenario['probes']):
        gauge_path = work / '_output' / f'gauge{i + 1:05d}.txt'
        if not gauge_path.exists():
            # GeoClaw writes 'gauge{id}.txt' without zero-padding for ids < 10000
            alt = work / '_output' / f'gauge{i + 1}.txt'
            gauge_path = alt if alt.exists() else gauge_path
        if not gauge_path.exists():
            print(f'  WARN: missing gauge file for probe {i + 1}')
            gauges_data.append((0.0, 0.0))
            continue
        gauges_data.append(parse_gauge(gauge_path))

    dest = args.dest or (FIXTURE_DIR / f'{scenario["id"]}.json')
    write_fixture(scenario, gauges_data, dt, dest)


if __name__ == '__main__':
    main()
