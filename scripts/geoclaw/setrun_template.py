"""
Generic GeoClaw setrun.py for the Nimbus Tier-3 fixture pipeline.

Reads its scenario-specific parameters from a sidecar `_run_params.json`
in the working directory, so the same template can be re-used for every
preset and custom-inputs grid point in `scenarios.json`.

The make machinery imports `setrun()` from this file. Don't rename.

Layout of `_run_params.json` (all keys required unless noted):

    {
      "domain": {
        "lower": [xlower_deg, ylower_deg],
        "upper": [xupper_deg, yupper_deg],
        "num_cells": [mx, my],
        "amr_levels": 2,
        "refinement_ratios": [4, 4, 4]
      },
      "tfinal_s": 9000,
      "num_output_times": 30,
      "topofiles": [[2, "/abs/path/etopo.asc"]],
      "dtopofile": "/abs/path/dtopo.tt3",   // OR
      "qinitfile": "/abs/path/qinit.xyz",
      "gauges": [{"id": 1, "lon": -86.39, "lat": -17.97}],
      "sea_level": 0.0,
      "manning_coefficient": 0.025,
      "deep_depth": 100.0
    }

Reference: chile2010 example shipped with clawpack/geoclaw, BSD-3-Clause.
"""

import json
import os


def setrun(claw_pkg='geoclaw'):
    from clawpack.clawutil import data

    assert claw_pkg.lower() == 'geoclaw'

    with open('_run_params.json') as fh:
        params = json.load(fh)

    rundata = data.ClawRunData(claw_pkg, num_dim=2)

    # --- clawdata --------------------------------------------------------
    cd = rundata.clawdata
    cd.num_dim = 2
    cd.lower[0] = params['domain']['lower'][0]
    cd.lower[1] = params['domain']['lower'][1]
    cd.upper[0] = params['domain']['upper'][0]
    cd.upper[1] = params['domain']['upper'][1]
    cd.num_cells[0] = params['domain']['num_cells'][0]
    cd.num_cells[1] = params['domain']['num_cells'][1]
    cd.num_eqn = 3
    cd.num_aux = 3
    cd.capa_index = 2
    cd.t0 = 0.0
    cd.output_style = 1
    cd.num_output_times = params['num_output_times']
    cd.tfinal = params['tfinal_s']
    cd.output_t0 = True
    cd.output_format = 'ascii'
    cd.output_q_components = 'all'
    cd.output_aux_components = 'none'
    cd.output_aux_onlyonce = False
    cd.verbosity = 0
    cd.dt_initial = 0.2
    cd.dt_max = 1e99
    cd.cfl_desired = 0.75
    cd.cfl_max = 1.0
    cd.steps_max = 50000
    cd.dt_variable = True
    cd.order = 2
    cd.dimensional_split = 'unsplit'
    cd.transverse_waves = 2
    cd.num_waves = 3
    cd.limiter = ['mc', 'mc', 'mc']
    cd.use_fwaves = True
    cd.source_split = 'godunov'
    cd.num_ghost = 2
    cd.bc_lower[0] = 'extrap'
    cd.bc_upper[0] = 'extrap'
    cd.bc_lower[1] = 'extrap'
    cd.bc_upper[1] = 'extrap'
    cd.checkpt_style = 0

    # --- AMR -------------------------------------------------------------
    amr = rundata.amrdata
    amr.amr_levels_max = params['domain'].get('amr_levels', 2)
    refinement_ratios = params['domain'].get('refinement_ratios', [4, 4, 4])
    amr.refinement_ratios_x = list(refinement_ratios)
    amr.refinement_ratios_y = list(refinement_ratios)
    amr.refinement_ratios_t = list(refinement_ratios)
    amr.aux_type = ['center', 'capacity', 'yleft']
    amr.flag_richardson = False
    amr.flag2refine = True
    amr.regrid_interval = 3
    amr.regrid_buffer_width = 2
    amr.clustering_cutoff = 0.700000
    amr.verbosity_regrid = 0

    # --- geo / physics ---------------------------------------------------
    geo = rundata.geo_data
    geo.gravity = 9.81
    geo.coordinate_system = 2  # spherical lat/lon
    geo.earth_radius = 6367500.0
    geo.coriolis_forcing = False
    geo.sea_level = params.get('sea_level', 0.0)
    geo.dry_tolerance = 1e-3
    geo.friction_forcing = True
    geo.manning_coefficient = params.get('manning_coefficient', 0.025)
    geo.friction_depth = 1e6

    refine = rundata.refinement_data
    refine.variable_dt_refinement_ratios = True
    refine.wave_tolerance = params.get('wave_tolerance', 0.02)
    refine.deep_depth = params.get('deep_depth', 100.0)
    refine.max_level_deep = amr.amr_levels_max

    # --- topography ------------------------------------------------------
    topo = rundata.topo_data
    topo.topofiles = []
    for tf in params['topofiles']:
        topo.topofiles.append([tf[0], tf[1]])

    # --- source: dtopo (seismic) OR qinit (volcanic / impact / landslide)
    if 'dtopofile' in params:
        dtopo_data = rundata.dtopo_data
        dtopo_data.dtopofiles = []
        dtopo_data.dtopofiles.append([3, params['dtopofile']])
        dtopo_data.dt_max_dtopo = 0.2
    if 'qinitfile' in params:
        qinit_data = rundata.qinit_data
        qinit_data.qinit_type = 4  # surface elevation eta from external file
        qinit_data.qinitfiles = []
        qinit_data.qinitfiles.append([1, 1, params['qinitfile']])

    # --- gauges ----------------------------------------------------------
    rundata.gaugedata.gauges = []
    for g in params.get('gauges', []):
        rundata.gaugedata.gauges.append(
            [g['id'], g['lon'], g['lat'], 0.0, params['tfinal_s']]
        )

    return rundata


if __name__ == '__main__':
    rd = setrun()
    rd.write()
    print('wrote .data files in', os.getcwd())
