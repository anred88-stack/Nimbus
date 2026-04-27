/**
 * Structured methodology content — the single source of truth that the
 * MethodologyPage consumes. Each entry pairs a concise formula block
 * with its full bibliographic citation. The list is the same content
 * the per-scenario PDF report will later filter against the scenario's
 * actual trigger set.
 */

export interface Citation {
  authors: string;
  year: number;
  title: string;
  venue: string;
  doi?: string;
}

export interface FormulaEntry {
  /** Short label shown in the equation header. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** The formula itself — kept as a monospace string for v1; a KaTeX
   *  pass can render this properly in a later version. */
  formula: string;
  /** One-sentence description of what the formula produces. */
  description: string;
  citation: Citation;
}

export interface MethodologySection {
  id: string;
  title: string;
  blurb: string;
  entries: FormulaEntry[];
}

const collins2005: Citation = {
  authors: 'Collins, G. S., Melosh, H. J. & Marcus, R. A.',
  year: 2005,
  title:
    'Earth Impact Effects Program: A web-based computer program for calculating the regional environmental consequences of a meteoroid impact on Earth',
  venue: 'Meteoritics & Planetary Science 40 (6), 817–840',
  doi: '10.1111/j.1945-5100.2005.tb00157.x',
};

const chyba1993: Citation = {
  authors: 'Chyba, C. F., Thomas, P. J. & Zahnle, K. J.',
  year: 1993,
  title: 'The 1908 Tunguska explosion: atmospheric disruption of a stony asteroid',
  venue: 'Nature 361 (6407), 40–44',
  doi: '10.1038/361040a0',
};

const popova2013: Citation = {
  authors: 'Popova, O. P. et al.',
  year: 2013,
  title: 'Chelyabinsk airburst, damage assessment, meteorite recovery, and characterization',
  venue: 'Science 342 (6162), 1069–1073',
  doi: '10.1126/science.1242642',
};

const teanby2011: Citation = {
  authors: 'Teanby, N. A. & Wookey, J.',
  year: 2011,
  title: 'Mars explosion seismology: A comparison of planetary and terrestrial mechanisms',
  venue: 'Earth and Planetary Science Letters 303 (3–4), 297–307',
  doi: '10.1016/j.epsl.2011.01.015',
};

const mcgetchin1973: Citation = {
  authors: 'McGetchin, T. R., Settle, M. & Head, J. W.',
  year: 1973,
  title: 'Radial thickness variation in impact crater ejecta',
  venue: 'Earth and Planetary Science Letters 20 (2), 226–236',
  doi: '10.1016/0012-821X(73)90162-3',
};

const ward2000: Citation = {
  authors: 'Ward, S. N. & Asphaug, E.',
  year: 2000,
  title: 'Asteroid Impact Tsunami: A probabilistic hazard assessment',
  venue: 'Icarus 145 (1), 64–78',
  doi: '10.1006/icar.1999.6336',
};

const wunnemann2007: Citation = {
  authors: 'Wünnemann, K., Weiss, R. & Hofmann, K.',
  year: 2007,
  title:
    'Characteristics of oceanic impact-induced large water waves — Re-evaluation of the tsunami hazard',
  venue: 'Meteoritics & Planetary Science 42 (11), 1893–1903',
  doi: '10.1111/j.1945-5100.2007.tb00548.x',
};

const toon1997: Citation = {
  authors: 'Toon, O. B., Zahnle, K., Morrison, D., Turco, R. P. & Covey, C.',
  year: 1997,
  title: 'Environmental perturbations caused by the impacts of asteroids and comets',
  venue: 'Reviews of Geophysics 35 (1), 41–78',
  doi: '10.1029/96RG03038',
};

const prinn1987: Citation = {
  authors: 'Prinn, R. G. & Fegley, B. Jr.',
  year: 1987,
  title: 'Bolide impacts, acid rain, and biospheric traumas at the Cretaceous-Tertiary boundary',
  venue: 'Earth and Planetary Science Letters 83 (1–4), 1–15',
  doi: '10.1016/0012-821X(87)90046-X',
};

const brittConsolmagno2003: Citation = {
  authors: 'Britt, D. T. & Consolmagno, G. J.',
  year: 2003,
  title: 'Stony meteorite porosities and densities: A review of the data through 2001',
  venue: 'Meteoritics & Planetary Science 38 (8), 1161–1180',
  doi: '10.1111/j.1945-5100.2003.tb00305.x',
};

const glasstoneDolan1977: Citation = {
  authors: 'Glasstone, S. & Dolan, P. J.',
  year: 1977,
  title: 'The Effects of Nuclear Weapons (3rd ed.)',
  venue: 'U.S. Department of Defense / Department of Energy',
};

const kinneyGraham1985: Citation = {
  authors: 'Kinney, G. F. & Graham, K. J.',
  year: 1985,
  title: 'Explosive Shocks in Air (2nd ed.)',
  venue: 'Springer-Verlag',
};

const nordyke1977: Citation = {
  authors: 'Nordyke, M. D.',
  year: 1977,
  title: 'An analysis of cratering data from desert alluvium',
  venue: 'Journal of Geophysical Research 82 (30), 4397–4406',
  doi: '10.1029/JB082i030p04397',
};

const needham2018: Citation = {
  authors: 'Needham, C. E.',
  year: 2018,
  title: 'Blast Waves (2nd ed.), Chapters 3–5 (Height-of-burst effects)',
  venue: 'Springer',
};

const longmire1978: Citation = {
  authors: 'Longmire, C. L.',
  year: 1978,
  title: 'On the electromagnetic pulse produced by nuclear explosions',
  venue: 'IEEE Transactions on Antennas and Propagation AP-26 (1), 3–13',
};

const hanksKanamori1979: Citation = {
  authors: 'Hanks, T. C. & Kanamori, H.',
  year: 1979,
  title: 'A moment magnitude scale',
  venue: 'Journal of Geophysical Research 84 (B5), 2348–2350',
};

const wellsCoppersmith1994: Citation = {
  authors: 'Wells, D. L. & Coppersmith, K. J.',
  year: 1994,
  title:
    'New empirical relationships among magnitude, rupture length, rupture width, rupture area, and surface displacement',
  venue: 'Bulletin of the Seismological Society of America 84 (4), 974–1002',
};

const strasser2010: Citation = {
  authors: 'Strasser, F. O., Arango, M. C. & Bommer, J. J.',
  year: 2010,
  title:
    'Scaling of the source dimensions of interface and intraslab subduction-zone earthquakes with moment magnitude',
  venue: 'Seismological Research Letters 81 (6), 941–950',
  doi: '10.1785/gssrl.81.6.941',
};

const joynerBoore1981: Citation = {
  authors: 'Joyner, W. B. & Boore, D. M.',
  year: 1981,
  title: 'Peak horizontal acceleration and velocity from strong-motion records',
  venue: 'Bulletin of the Seismological Society of America 71 (6), 2011–2038',
};

const boore2014: Citation = {
  authors: 'Boore, D. M., Stewart, J. P., Seyhan, E. & Atkinson, G. M.',
  year: 2014,
  title:
    'NGA-West2 Equations for Predicting PGA, PGV, and 5%-Damped PSA for Shallow Crustal Earthquakes',
  venue: 'Earthquake Spectra 30 (3), 1057–1085',
  doi: '10.1193/070113EQS184M',
};

const faenzaMichelini2010: Citation = {
  authors: 'Faenza, L. & Michelini, A.',
  year: 2010,
  title:
    'Regression analysis of MCS intensity and ground motion parameters in Italy and its application in ShakeMap',
  venue: 'Geophysical Journal International 180 (3), 1117–1133',
  doi: '10.1111/j.1365-246X.2009.04467.x',
};

const worden2012: Citation = {
  authors: 'Worden, C. B., Gerstenberger, M. C., Rhoades, D. A. & Wald, D. J.',
  year: 2012,
  title:
    'Probabilistic relationships between ground-motion parameters and Modified Mercalli Intensity in California',
  venue: 'Bulletin of the Seismological Society of America 102 (1), 204–221',
  doi: '10.1785/0120110156',
};

const youdIdriss2001: Citation = {
  authors: 'Youd, T. L. & Idriss, I. M.',
  year: 2001,
  title:
    'Liquefaction resistance of soils: Summary report from the 1996 NCEER and 1998 NCEER/NSF workshops',
  venue: 'ASCE Journal of Geotechnical and Geoenvironmental Engineering 127 (4), 297–313',
  doi: '10.1061/(ASCE)1090-0241(2001)127:4(297)',
};

const mastin2009: Citation = {
  authors: 'Mastin, L. G. et al.',
  year: 2009,
  title:
    'A multidisciplinary effort to assign realistic source parameters to models of volcanic ash-cloud transport',
  venue: 'Journal of Volcanology and Geothermal Research 186 (1–2), 10–21',
  doi: '10.1016/j.jvolgeores.2009.01.008',
};

const newhallSelf1982: Citation = {
  authors: 'Newhall, C. G. & Self, S.',
  year: 1982,
  title:
    'The Volcanic Explosivity Index (VEI): An estimate of explosive magnitude for historical volcanism',
  venue: 'Journal of Geophysical Research 87 (C2), 1231–1238',
};

const dadeHuppert1998: Citation = {
  authors: 'Dade, W. B. & Huppert, H. E.',
  year: 1998,
  title: 'Long-runout rockfalls',
  venue: 'Geology 26 (9), 803–806',
  doi: '10.1130/0091-7613(1998)026<0803:LRR>2.3.CO;2',
};

const robock2000: Citation = {
  authors: 'Robock, A.',
  year: 2000,
  title: 'Volcanic eruptions and climate',
  venue: 'Reviews of Geophysics 38 (2), 191–219',
  doi: '10.1029/1998RG000054',
};

const iverson1997: Citation = {
  authors: 'Iverson, R. M.',
  year: 1997,
  title: 'The physics of debris flows',
  venue: 'Reviews of Geophysics 35 (3), 245–296',
  doi: '10.1029/97RG00426',
};

const synolakis1987: Citation = {
  authors: 'Synolakis, C. E.',
  year: 1987,
  title: 'The runup of solitary waves',
  venue: 'Journal of Fluid Mechanics 185, 523–545',
  doi: '10.1017/S002211208700329X',
};

const watts2000: Citation = {
  authors: 'Watts, P.',
  year: 2000,
  title: 'Tsunami features of solid block underwater landslides',
  venue: 'ASCE Journal of Waterway, Port, Coastal, and Ocean Engineering 126 (3), 144–152',
  doi: '10.1061/(ASCE)0733-950X(2000)126:3(144)',
};

const heidarzadehSatake2015: Citation = {
  authors: 'Heidarzadeh, M. & Satake, K.',
  year: 2015,
  title:
    'Source properties of the 1998 July 17 Papua New Guinea tsunami based on tide gauge records and numerical simulation',
  venue: 'Geophysical Journal International 202 (1), 361–377',
};

const pike1980: Citation = {
  authors: 'Pike, R. J.',
  year: 1980,
  title: 'Formation of complex impact craters: Evidence from Mars and other planets',
  venue: 'Icarus 43 (1), 1–19',
  doi: '10.1016/0019-1035(80)90244-4',
};

const suzuki1983: Citation = {
  authors: 'Suzuki, T.',
  year: 1983,
  title: 'A theoretical model for dispersion of tephra',
  venue:
    'In Arc Volcanism: Physics and Tectonics (Shimozuru & Yokoyama, eds.), Terra Scientific Publishing, Tokyo, 95–113',
};

const bonadonnaPhillips2003: Citation = {
  authors: 'Bonadonna, C. & Phillips, J. C.',
  year: 2003,
  title: 'Sedimentation from strong volcanic plumes',
  venue: 'Journal of Geophysical Research 108 (B7), 2340',
  doi: '10.1029/2002JB002034',
};

const ganser1993: Citation = {
  authors: 'Ganser, G. H.',
  year: 1993,
  title: 'A rational approach to drag prediction of spherical and nonspherical particles',
  venue: 'Powder Technology 77 (2), 143–152',
  doi: '10.1016/0032-5910(93)80051-B',
};

const waldAllen2007: Citation = {
  authors: 'Wald, D. J. & Allen, T. I.',
  year: 2007,
  title:
    'Topographic Slope as a Proxy for Seismic Site Conditions (Vs30) and Amplification Around the Globe',
  venue: 'Bulletin of the Seismological Society of America 97 (5), 1379–1395',
  doi: '10.1785/0120060267',
};

const sethian1996: Citation = {
  authors: 'Sethian, J. A.',
  year: 1996,
  title: 'A fast marching level set method for monotonically advancing fronts',
  venue: 'Proceedings of the National Academy of Sciences 93 (4), 1591–1595',
  doi: '10.1073/pnas.93.4.1591',
};

const melosh1989: Citation = {
  authors: 'Melosh, H. J.',
  year: 1989,
  title: 'Impact Cratering: A Geologic Process (Ch. 5 — angle distribution)',
  venue: 'Oxford University Press',
};

const whitham1974: Citation = {
  authors: 'Whitham, G. B.',
  year: 1974,
  title: 'Linear and Nonlinear Waves (§8.2 Geometrical acoustics; §6.3 Weak-shock theory)',
  venue: 'Wiley-Interscience, ISBN 978-0-471-94090-6',
};

const sachs1944: Citation = {
  authors: 'Sachs, R. G.',
  year: 1944,
  title: 'The dependence of blast on ambient pressure and temperature',
  venue: 'Ballistic Research Laboratories Report 466 (Aberdeen Proving Ground)',
};

const korobeinikov1991: Citation = {
  authors: 'Korobeinikov, V. P.',
  year: 1991,
  title:
    'Problems of Point Blast Theory (Ch. 1 §1.4 — Dimensional analysis and self-similar solutions)',
  venue: 'AIP Press / Springer, ISBN 0-88318-660-7',
};

const ussa1976: Citation = {
  authors: 'COESA / NOAA / NASA / USAF',
  year: 1976,
  title: 'U.S. Standard Atmosphere 1976',
  venue: 'NOAA-S/T 76-1562, U.S. Government Printing Office',
};

const brown2013: Citation = {
  authors: 'Brown, P. G., Assink, J. D., Astiz, L., et al.',
  year: 2013,
  title: 'A 500-kiloton airburst over Chelyabinsk and an enhanced hazard from small impactors',
  venue: 'Nature 503, 238–241',
  doi: '10.1038/nature12741',
};

const reVelle1976: Citation = {
  authors: 'ReVelle, D. O.',
  year: 1976,
  title: 'On meteor-generated infrasound',
  venue: 'Journal of Geophysical Research 81 (7), 1217–1230',
  doi: '10.1029/JB081i007p01217',
};

const reasenbergJones1989: Citation = {
  authors: 'Reasenberg, P. A. & Jones, L. M.',
  year: 1989,
  title: 'Earthquake hazard after a mainshock in California',
  venue: 'Science 243 (4895), 1173–1176',
  doi: '10.1126/science.243.4895.1173',
};

const bath1965: Citation = {
  authors: 'Båth, M.',
  year: 1965,
  title: 'Lateral inhomogeneities in the upper mantle',
  venue: 'Tectonophysics 2 (6), 483–514',
  doi: '10.1016/0040-1951(65)90003-X',
};

const gutenbergRichter1954: Citation = {
  authors: 'Gutenberg, B. & Richter, C. F.',
  year: 1954,
  title: 'Seismicity of the Earth and Associated Phenomena (2nd ed.)',
  venue: 'Princeton University Press',
};

const utsu1961: Citation = {
  authors: 'Utsu, T.',
  year: 1961,
  title: 'A statistical study of the occurrence of aftershocks',
  venue: 'Geophysical Magazine 30, 521–605',
};

const okada1992: Citation = {
  authors: 'Okada, Y.',
  year: 1992,
  title: 'Internal deformation due to shear and tensile faults in a half-space',
  venue: 'Bulletin of the Seismological Society of America 82 (2), 1018–1040',
};

const lamb1932: Citation = {
  authors: 'Lamb, H.',
  year: 1932,
  title: 'Hydrodynamics (6th ed.), §170 (Long waves over uniform depth)',
  venue: 'Cambridge University Press',
};

const bryant2014: Citation = {
  authors: 'Bryant, E.',
  year: 2014,
  title: 'Tsunami: The Underrated Hazard (3rd ed., Ch. 3 + Ch. 10 — sources and damage)',
  venue: 'Springer Praxis Books, ISBN 978-3-319-06133-7',
};

const imamura2009: Citation = {
  authors: 'Imamura, F., Yalçıner, A. C. & Ozyurt, G.',
  year: 2009,
  title: 'Tsunami Modelling Manual (revised) — IUGG/IOC Time Project (Ch. 7 intensity scale)',
  venue: 'UNESCO/IOC, IUGG Tsunami Commission',
};

const femaP646: Citation = {
  authors: 'Federal Emergency Management Agency',
  year: 2019,
  title:
    'FEMA P-646 — Guidelines for Design of Structures for Vertical Evacuation from Tsunamis (3rd ed., §3 inundation envelopes)',
  venue: 'Applied Technology Council, FEMA',
};

const fema55: Citation = {
  authors: 'Federal Emergency Management Agency',
  year: 2011,
  title: 'FEMA 55 — Coastal Construction Manual (4th ed., §3.4 — coastal hazard envelopes)',
  venue: 'FEMA',
};

const leMehauteWang1996: Citation = {
  authors: 'Le Méhauté, B. & Wang, S.',
  year: 1996,
  title: 'Water Waves Generated by Underwater Explosion',
  venue: 'Advanced Series on Ocean Engineering 10, World Scientific, ISBN 978-981-02-2083-3',
};

const glicken1996: Citation = {
  authors: 'Glicken, H.',
  year: 1996,
  title: 'Rockslide-debris avalanche of May 18, 1980, Mount St. Helens Volcano, Washington',
  venue: 'USGS Open-File Report 96-677',
};

const grilli2019: Citation = {
  authors: 'Grilli, S. T., Tappin, D. R., Carey, S., et al.',
  year: 2019,
  title: 'Modelling of the tsunami from the December 22, 2018 lateral collapse of Anak Krakatau',
  venue: 'Scientific Reports 9, 11946',
  doi: '10.1038/s41598-019-48327-6',
};

const schultzAnderson1996: Citation = {
  authors: 'Schultz, P. H. & Anderson, R. R.',
  year: 1996,
  title: 'Asymmetry of ejecta and target damage in oblique impacts',
  venue: 'Lunar and Planetary Science XXVII, 1149–1150',
};

const boslough2008: Citation = {
  authors: 'Boslough, M. B. E. & Crawford, D. A.',
  year: 2008,
  title: 'Low-altitude airbursts and the impact threat',
  venue: 'International Journal of Impact Engineering 35 (12), 1441–1448',
  doi: '10.1016/j.ijimpeng.2008.07.053',
};

const tatem2017: Citation = {
  authors: 'Tatem, A. J.',
  year: 2017,
  title: 'WorldPop, open data for spatial demography',
  venue: 'Scientific Data 4, 170004',
  doi: '10.1038/sdata.2017.4',
};

const schiavina2023: Citation = {
  authors: 'Schiavina, M., Freire, S. & MacManus, K.',
  year: 2023,
  title: 'GHS-POP R2023A — GHS population grid multitemporal (1975–2030)',
  venue: 'European Commission, Joint Research Centre',
  doi: '10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE',
};

const geistBilek2001: Citation = {
  authors: 'Geist, E. L. & Bilek, S. L.',
  year: 2001,
  title: 'Effect of depth-dependent shear modulus on tsunami generation along subduction zones',
  venue: 'Geophysical Research Letters 28 (7), 1315–1318',
  doi: '10.1029/2000GL012385',
};

const taniokaSatake1996: Citation = {
  authors: 'Tanioka, Y. & Satake, K.',
  year: 1996,
  title: 'Tsunami generation by horizontal displacement of ocean bottom',
  venue: 'Geophysical Research Letters 23 (8), 861–864',
  doi: '10.1029/96GL00736',
};

const satake2013: Citation = {
  authors: 'Satake, K., Fujii, Y., Harada, T. & Namegaya, Y.',
  year: 2013,
  title:
    'Time and space distribution of coseismic slip of the 2011 Tohoku earthquake as inferred from tsunami waveform data',
  venue: 'Bulletin of the Seismological Society of America 103 (2B), 1473–1492',
  doi: '10.1785/0120120122',
};

export const METHODOLOGY_SECTIONS: MethodologySection[] = [
  {
    id: 'impact',
    title: 'Cosmic impacts',
    blurb:
      'Physics of an asteroid or comet striking Earth. Inputs are the impactor diameter, velocity, density, and impact angle; outputs include kinetic energy, crater size, seismic magnitude, thermal radiation, and atmospheric / climate effects.',
    entries: [
      {
        id: 'kinetic-energy',
        name: 'Impactor kinetic energy',
        formula: 'E = ½ · m · v² ,   m = (π/6) · D³ · ρ',
        description:
          'Translational kinetic energy of a spherical impactor of diameter D and bulk density ρ.',
        citation: collins2005,
      },
      {
        id: 'transient-crater',
        name: 'Transient crater diameter',
        formula: 'D_tc = 1.161 · (ρ_i/ρ_t)^(1/3) · D^0.78 · v^0.44 · g^(−0.22) · sin^(1/3)(θ)',
        description:
          'π-group scaling from Collins et al. 2005, Eq. 21. Yields the cavity diameter at maximum excavation.',
        citation: collins2005,
      },
      {
        id: 'final-crater',
        name: 'Final crater diameter',
        formula:
          'D_fr = { 1.25 · D_tc                (simple, D_tc ≤ 3.2 km)\n        1.17 · D_tc^1.13 / D_c^0.13 (complex, Eq. 27) }',
        description:
          'Post-collapse rim-to-rim diameter. Piecewise across the simple/complex transition (~3.2 km on Earth).',
        citation: collins2005,
      },
      {
        id: 'crater-depth',
        name: 'Crater depth (complex)',
        formula: 'd/D ≈ 1/5  (simple); d = f(D)  (complex, Pike 1980 piecewise)',
        description:
          'Depth-to-diameter ratio falls off for complex craters due to modification collapse.',
        citation: pike1980,
      },
      {
        id: 'seismic-teanby',
        name: 'Seismic Mw — Teanby & Wookey 2011',
        formula: 'M₀ = k · E  (k = 10⁻⁴) ;  Mw = (2/3) · log₁₀(M₀) − 6.07',
        description:
          'Modern impact-Mw estimator via seismic efficiency k calibrated from UNE + meteor data. Runs 2–3 Mw units below Schultz-Gault.',
        citation: teanby2011,
      },
      {
        id: 'airburst',
        name: 'Atmospheric airburst classifier',
        formula: 'h_breakup = H · ln(ρ₀ · v² / Y) ;  h_burst = h_breakup − 2H − k_D·ln(D/D₀)',
        description:
          'Chyba–Thomas–Zahnle 1993 pancake model. Classifies the impactor as INTACT, PARTIAL_AIRBURST or COMPLETE_AIRBURST, with energyFractionToGround used to scale the crater.',
        citation: chyba1993,
      },
      {
        id: 'chelyabinsk-validation',
        name: 'Chelyabinsk 2013 validation anchor',
        formula: '17 m S-type, 19 km/s → burst ≈ 22 km (observed 27 km)',
        description:
          'Popova et al. 2013 dataset used to calibrate the pancake-model penetration coefficient.',
        citation: popova2013,
      },
      {
        id: 'taxonomy',
        name: 'Impactor taxonomy presets',
        formula: 'COMETARY (ρ=600), C-type (2000), S-type (3300), M-type (5300), Iron (7800)',
        description: 'Density class midpoints from Britt & Consolmagno 2003 Table 2.',
        citation: brittConsolmagno2003,
      },
      {
        id: 'ejecta',
        name: 'Ejecta blanket thickness',
        formula: 'T(r) = 0.14 · R · (R / r)³     (r ≥ R, R = crater rim radius)',
        description:
          'Continuous ejecta-blanket deposit decay with distance. Inverted for blanket outer-edge radii.',
        citation: mcgetchin1973,
      },
      {
        id: 'strat-dust',
        name: 'Stratospheric dust loading',
        formula: 'M_dust ≈ 5 × 10¹⁶ · (E / 4 × 10²³ J)  kg',
        description: 'Linear scaling anchored at the Chicxulub reference (Toon 1997 Table 3).',
        citation: toon1997,
      },
      {
        id: 'acid-rain',
        name: 'Shock-produced HNO₃ mass',
        formula: 'M_HNO3 ≈ 1 × 10¹⁶ · (E / 4 × 10²³ J)  kg',
        description:
          'Globally integrated atmospheric NOx/HNO₃ chemistry from bolide shock heating.',
        citation: prinn1987,
      },
      {
        id: 'impact-tsunami-cavity',
        name: 'Ocean-impact tsunami cavity',
        formula: 'R_C = (3·E / (2π · ρ_w · g))^(1/4) ;  A₀ = R_C / 2 ;  A(r) = A₀ · R_C / r',
        description:
          'Ward & Asphaug 2000 energy-partitioning cavity plus 1/r cylindrical spreading.',
        citation: ward2000,
      },
      {
        id: 'impact-tsunami-wunnemann',
        name: 'Tsunami hydrocode damping',
        formula: 'f_damp(r) = min(1, 0.8 · √(100 km / r))',
        description:
          'Wünnemann 2007 / Melosh 2003: short-wavelength impact waves dissipate 4–10× faster than classical tsunamis at continent-crossing range.',
        citation: wunnemann2007,
      },
      {
        id: 'penetration-bonus',
        name: 'Pancake penetration bonus',
        formula: 'penetrationBonus = max(0, 1.2 · ln(D / 10 m) · H_scale)',
        description:
          'Diameter-dependent bonus subtracted from the breakup-to-burst altitude gap. For Chicxulub (D = 15 km) this evaluates to ≈ 70 km, exceeding the breakup altitude itself and forcing the regime to INTACT — explaining why a 15 km body fragments at 46 km altitude yet still delivers 100 % of its kinetic energy to the ground.',
        citation: chyba1993,
      },
      {
        id: 'atmospheric-yield',
        name: 'Atmospheric airburst yield',
        formula: 'E_atm = (1 − gf) · E_kinetic',
        description:
          'Yield released as a fireball + shock pulse in the atmosphere during entry. Zero for INTACT events; ≈ 99 % of total KE for COMPLETE_AIRBURST (Tunguska, Chelyabinsk). Drives the entry-damage radii below.',
        citation: chyba1993,
      },
      {
        id: 'bolide-airburst-amplification',
        name: 'Bolide-airburst altitude amplification',
        formula: 'f(h) = (P_0 / P_amb(h))^(1 / β),   β = 5/3,   capped at 15×',
        description:
          'Closed-form altitude amplification for entry-phase damage radii. Built from Whitham (1974) §8.2 weak-shock invariance ΔP/P_amb ≈ const through stratified atmosphere, Sachs (1944) blast scaling ΔP ∝ R^(−β), Korobeinikov (1991) §1.4 intermediate-shock exponent, and the U.S. Standard Atmosphere 1976 for actual P(h). Validates within ~1 % on Chelyabinsk (Brown 2013) and ~15 % on Tunguska. Replaces a previous 2-point empirical linear fit.',
        citation: whitham1974,
      },
      {
        id: 'entry-flash-shock',
        name: 'Atmospheric flash + shock damage radii',
        formula:
          'r_flash(p) = R_KG_thermal(E_atm, p) · f(h),   r_shock(p) = R_KG_blast(E_atm, p) · f(h)',
        description:
          'Per-event flash (1°/2°/3° burn) and shock (5/1/0.5 psi) reach radii at the ground. Computed by feeding the atmospheric yield E_atm into the standard Glasstone & Dolan §7 thermal-fluence and Kinney-Graham §5 overpressure formulas, then multiplied by the bolide-airburst amplification factor. Brown 2013 anchors the Chelyabinsk observed 0.5 psi reach at ≈ 120 km.',
        citation: brown2013,
      },
      {
        id: 'damage-rings-airburst-honest',
        name: 'Damage rings honour the airburst regime',
        formula: 'damage(p) = max(R_surface(gf · E_kinetic, p), r_atmospheric_flash_or_shock(p))',
        description:
          'Pre-fix, every impact regime computed the headline damage rings from `impactDamageRadii(E_kinetic)` as if the FULL kinetic energy hit the ground as a sea-level surface burst — over-stating Tunguska and Chelyabinsk reach by an order of magnitude. The simulator now combines the two physically distinct ground-observer components: ground-coupled `gf · E_kinetic` (drives Chicxulub-class craters) and atmospheric airburst `(1 − gf) · E_kinetic` with altitude amplification (drives Tunguska-class flash + shock). Both are normalised to the same observer at the ground; the union is the max() because being inside either ring is equally bad.',
        citation: brown2013,
      },
      {
        id: 'ejecta-asymmetry',
        name: 'Oblique-impact ejecta asymmetry',
        formula:
          'butterfly factor f = max(0, 1 − θ° / 45°);  semi-major × (1 + 0.4·f);  downrange offset = 0.3·f·blanketEdge',
        description:
          'Schultz & Anderson 1996 oblique-impact pattern: at θ ≥ 45° the ejecta blanket is rotationally symmetric; at very low entry angles (Chelyabinsk-class θ = 18°) it elongates downrange of the trajectory and shifts forward, producing the characteristic "butterfly" pattern observed at experimental crater scales.',
        citation: schultzAnderson1996,
      },
    ],
  },
  {
    id: 'explosion',
    title: 'Nuclear & conventional explosions',
    blurb:
      'Surface / airburst detonations. Input is TNT-equivalent yield + height of burst + ground type; outputs include blast radii, thermal fluence, firestorm, crater, initial radiation, and EMP footprint.',
    entries: [
      {
        id: 'overpressure',
        name: 'Peak overpressure (Kinney–Graham)',
        formula: 'ΔP(Z) = 808 · [1 + (Z/4.5)²] / √(...)     (Z = R · W^(−1/3))',
        description:
          'Scaled-distance surface-burst fit. Inverted for the 5 psi (34.5 kPa) and 1 psi (6.9 kPa) ring radii.',
        citation: kinneyGraham1985,
      },
      {
        id: 'blast-thresholds',
        name: 'Blast damage thresholds',
        formula: '5 psi ≈ 34.5 kPa  (residential collapse) ;  1 psi ≈ 6.9 kPa  (window breakage)',
        description: 'Glasstone & Dolan §5.129 and §5.139 canonical structural-damage levels.',
        citation: glasstoneDolan1977,
      },
      {
        id: 'hob-correction',
        name: 'Height-of-burst correction',
        formula:
          'f(z) piecewise in scaled HOB z = HOB · W^(−1/3)  [0.85 surface, 1.00 optimum, 0.25 stratospheric]',
        description:
          'Fit to Glasstone Fig. 3.73 / Needham Fig. 3-3. Applied as a scaling factor on the Kinney-Graham 5/1 psi radii.',
        citation: needham2018,
      },
      {
        id: 'thermal',
        name: 'Thermal fluence / burn radii',
        formula: 'Q = f_th · τ · W / (4π · R²) ;  3° burn @ 3.35 × 10⁵ J/m²',
        description:
          'Glasstone §7.03–7.35 point-source inverse-square fluence with a thermal partition factor (0.35 nuclear, 3×10⁻³ impact).',
        citation: glasstoneDolan1977,
      },
      {
        id: 'firestorm',
        name: 'Firestorm ignition / sustain',
        formula: 'Ignition @ 4.19 × 10⁵ J/m² (10 cal/cm²) ;  Sustain @ 2.51 × 10⁵ J/m² (6 cal/cm²)',
        description:
          'Glasstone §7.40–7.42 dry-kindling ignition and self-drawing firestorm thresholds.',
        citation: glasstoneDolan1977,
      },
      {
        id: 'crater',
        name: 'Surface-burst crater (ground-type dependent)',
        formula:
          'D_apparent = K · W_kt^0.3     (K = 40 hard rock, 60 firm, 75 dry, 92 wet, 105 clay)',
        description:
          'Nordyke 1977 desert-alluvium + Murphey-Vortman 1961 rock + Young 1997 SAND97 clay.',
        citation: nordyke1977,
      },
      {
        id: 'radiation',
        name: 'Initial-radiation lethal-dose radii',
        formula: 'R_LD50 = 700 m · W_kt^0.4  ;  R_LD100 = 0.7 · R_LD50  ;  R_ARS = 1.4 · R_LD50',
        description:
          'Glasstone Fig. 8.46 yield scaling with the UNSCEAR/BEIR dose-response curve (LD₅₀ ≈ 4.5 Gy, LD₁₀₀ ≈ 8 Gy).',
        citation: glasstoneDolan1977,
      },
      {
        id: 'emp',
        name: 'EMP regime + HEMP footprint',
        formula:
          'HEMP peak = min(50 kV/m, 50 kV/m · (W/1 Mt)^(1/3)) @ HOB > 30 km ;  footprint = √(2·R_E·h + h²)',
        description:
          'Longmire 1978 Compton-current model with cube-root yield scaling below the IEC 61000-2-9 1 Mt anchor; the 50 kV/m peak saturates above that yield (gamma-flux plateau at the ionising layer). Earth-tangent horizon disc for the affected area. Validated against Starfish Prime 1962 (Oahu at 1 450 km).',
        citation: longmire1978,
      },
      {
        id: 'underwater-burst-tsunami',
        name: 'Underwater / contact-water tsunami source',
        formula: 'E_eff = 0.08 · E_yield ;  R_C = (3·E_eff / (2π · ρ_w · g))^(1/4);  η_0 = R_C / 2',
        description:
          'The Ward & Asphaug (2000) cavity-radius formula extended to chemical / nuclear underwater bursts via the Le Méhauté & Wang (1996) mechanical-coupling fraction (5–15 % of yield ends up as bulk water displacement; we use 0.08, calibrated against Glasstone Table 6.50 ≈ 180 m source amplitude for 1 Mt at optimum depth). Activates only when `regime === SURFACE` and `waterDepth > 0`.',
        citation: leMehauteWang1996,
      },
      {
        id: 'contact-water-burst-flag',
        name: 'Contact-water burst flag (atmospheric ring dimming)',
        formula: 'isContactWaterBurst = (regime === SURFACE) AND (waterDepth > 0)',
        description:
          'Glasstone & Dolan §6 documents that mechanical coupling into the atmosphere drops to ≈ 5–15 % when a SURFACE burst sits directly on a water column. The on-globe overpressure / thermal / crater rings are dimmed (alpha 0.85 → 0.4) so the eye reads the tsunami branch as the dominant story; the published radii are emitted unchanged so callers that need the land-equivalent reference can still read them.',
        citation: glasstoneDolan1977,
      },
      {
        id: 'coastal-explosion-tsunami',
        name: 'Coastal-explosion tsunami auto-detect',
        formula:
          'findNearbyOceanDepth(grid, click, 5 km) → median ocean-cell depth on a 9×9 lattice',
        description:
          'When a SURFACE burst lands on a positive-elevation coastal cell (Beirut 2020 on Hangar 12, Castle Bravo on the Bikini reef), the simulator searches a 5 km neighbourhood for ocean cells with depth < −10 m and feeds the median depth into the underwater-burst tsunami pipeline (capped at 200 m to bound the synthetic coupling). Without this fall-through the tsunami branch silently dropped for coastal scenarios — the small wave train recorded after Beirut 2020 would have been invisible.',
        citation: leMehauteWang1996,
      },
    ],
  },
  {
    id: 'earthquake',
    title: 'Earthquakes',
    blurb:
      'Crustal and subduction earthquakes from moment magnitude Mw. Outputs include seismic moment, rupture length, peak ground acceleration at distance, felt intensity (California + European calibrations), and liquefaction.',
    entries: [
      {
        id: 'seismic-moment',
        name: 'Seismic moment (Hanks–Kanamori)',
        formula: 'M₀ = 10^(1.5·Mw + 9.1)   N·m',
        description: 'SI inversion of the moment-magnitude scale.',
        citation: hanksKanamori1979,
      },
      {
        id: 'rupture-continental',
        name: 'Rupture length (continental)',
        formula:
          'log₁₀(L_km) = a + b · Mw      (per fault type, Wells & Coppersmith 1994 Table 2A)',
        description: 'Empirical fit on 244 continental-crust events with 4.8 ≤ Mw ≤ 8.1.',
        citation: wellsCoppersmith1994,
      },
      {
        id: 'rupture-megathrust',
        name: 'Rupture length (subduction interface)',
        formula: 'log₁₀(L_km) = −2.477 + 0.585 · Mw',
        description:
          'Strasser 2010 fit on 95 interface events; used in preference to Wells-Coppersmith for subduction-zone thrusts (Tōhoku, Sumatra, Cascadia).',
        citation: strasser2010,
      },
      {
        id: 'pga-jb81',
        name: 'PGA attenuation (legacy Joyner-Boore)',
        formula: 'log₁₀(A/g) = −1.02 + 0.249 · Mw − log₁₀(D) − 0.00255·D ;  D = √(R² + 7.3²) km',
        description:
          '1981-era Western-US fit, retained as a legacy reference in the UI next to the modern NGA-West2 row.',
        citation: joynerBoore1981,
      },
      {
        id: 'pga-nga',
        name: 'PGA attenuation (NGA-West2, BSSA14)',
        formula: 'ln(PGA_g) = F_E(M, mech) + F_P(R, M) + F_S(Vs30)',
        description:
          'Boore 2014 NGA-West2 equation with magnitude-dependent spreading, 4.5 km near-source clamp, fault-type constants, and Vs30 site factor. Default displayed estimator.',
        citation: boore2014,
      },
      {
        id: 'vs30',
        name: 'Vs30 site amplification',
        formula: 'f_S(Vs30) = exp(−0.4 · ln(Vs30 / 760))',
        description:
          'Simplified Boore 2014 site term. Vs30 = 760 m/s rock returns 1.0; Vs30 = 300 m/s soft soil amplifies ~1.45×.',
        citation: boore2014,
      },
      {
        id: 'mmi-ca',
        name: 'MMI from PGA (California)',
        formula: 'MMI = piecewise in log₁₀(PGA_cm/s²) ;  break at log₁₀ = 1.57',
        description: 'Worden 2012 Bi-linear GMICE, California dataset.',
        citation: worden2012,
      },
      {
        id: 'mmi-eu',
        name: 'MMI from PGA (Europe / Italy)',
        formula: 'MCS = 1.68 + 2.58 · log₁₀(PGA_cm/s²)',
        description:
          'Faenza & Michelini 2010 — Italian ShakeMap calibration, preferred on the Eurasian plate.',
        citation: faenzaMichelini2010,
      },
      {
        id: 'liquefaction',
        name: 'Liquefaction-radius threshold',
        formula: 'PGA_thresh(M) = 0.10 g · (M/7.5)^(−2.56) ;  radius = inverse PGA attenuation',
        description:
          'Simplified Youd & Idriss 2001 susceptibility threshold on saturated sandy soil with Idriss 1999 magnitude scaling factor.',
        citation: youdIdriss2001,
      },
      {
        id: 'wald-allen-vs30',
        name: 'Site Vs30 from topographic slope',
        formula:
          'slope < 0.007 → Vs30 ≈ 180   ;   0.025 → 365   ;   0.071 → 555   ;   ≥ 0.138 → 760 m/s',
        description:
          'Wald & Allen 2007 Table 1 (active-tectonic regions) maps the terrain gradient at a site to a NEHRP Vs30 proxy. Log-interpolated within each bin. Rock outcrops → NEHRP B; alluvial basins → NEHRP D/E. The slope is measured on a 256×256 terrarium PNG tile (AWS public terrain-tiles dataset, CC0, ~0.6 km/pixel at zoom 8) fetched on-demand for each scenario location — so every click on the globe triggers a real DEM lookup, not a shipped asset.',
        citation: waldAllen2007,
      },
      {
        id: 'aftershock-bath',
        name: 'Båth law — magnitude gap',
        formula: 'M_max_aftershock ≈ M_main − 1.2',
        description:
          "The largest aftershock is on average 1.2 magnitude units below the mainshock — universal across tectonic regimes. Caps the simulator's Gutenberg-Richter sampler so an Mw 9 megathrust does not produce an Mw 9 aftershock.",
        citation: bath1965,
      },
      {
        id: 'aftershock-gutenberg-richter',
        name: 'Magnitude distribution',
        formula: 'log₁₀ N(M ≥ m) = a − b · m   (b ≈ 1)',
        description:
          'Power-law magnitude-frequency distribution. Inverse-CDF sampling: m = M_c − log₁₀(U) / b for U ~ Uniform[0, 1], capped at the Båth ceiling.',
        citation: gutenbergRichter1954,
      },
      {
        id: 'aftershock-omori-utsu',
        name: 'Omori-Utsu temporal decay',
        formula: 'n(t) = K / (c + t)^p   (p ≈ 1.1, c ≈ 0.05 d)',
        description:
          "Aftershock rate decays as a modified-Omori power law. Inverse-CDF sampling across the simulator's 30-day default window concentrates events in the first hours where the dense early cluster is observationally dominant.",
        citation: utsu1961,
      },
      {
        id: 'aftershock-reasenberg-jones',
        name: 'Aftershock catalogue magnitude',
        formula:
          'log₁₀ N_total = a + b · (M_main − M_c)   (a = −1.67, b = 0.91, California-calibrated)',
        description:
          'Sets the total number of aftershocks above the completeness cutoff M_c. The simulator clamps at 500 events for renderer responsiveness on extreme megathrust scenarios.',
        citation: reasenbergJones1989,
      },
      {
        id: 'aftershock-shaking-footprint',
        name: 'Per-aftershock MMI radii (click-through)',
        formula: 'r_MMI(M_event) = distanceForPga(M_event, pga(MMI))',
        description:
          "Each aftershock dot on the globe is clickable. The simulator re-uses the Joyner-Boore (1981) attenuation and Worden et al. (2012) MMI conversion at the aftershock's magnitude to produce three felt-intensity contours (V/VI/VII) around the picked event, plus the epicentral MMI shown in the detail card.",
        citation: worden2012,
      },
      {
        id: 'seismic-tsunami-source',
        name: 'Fault-style-aware tsunami source',
        formula:
          'D̄ = M₀ / (μ · L · W),   W = L / aspect(faultType),   uplift = upliftFactor(faultType) · D̄,\nA₀ = η · uplift,   A(r) = A₀ · √(R₀ / r)',
        description:
          'Hanks-Kanamori 1979 moment combined with fault-style-dependent rupture aspect and dip-dependent uplift, then propagated as a cylindrical line source from a half-length R₀ = L/2. Both the aspect ratio L/W and the uplift factor are now functions of the fault style rather than the legacy single constants (3 and 0.5) — see the next two entries. The wave-coupling efficiency η ≈ 0.7 (Satake 2013 DART-buoy inversion of Tōhoku 2011) accounts for the energy that does not project onto the propagating long wave. Together they bring near-source amplitudes within ≈ 30 % of the observed buoy record across megathrust, continental-thrust, and normal-fault events.',
        citation: okada1992,
      },
      {
        id: 'rupture-aspect-fault-style',
        name: 'Rupture aspect ratio L/W per fault style',
        formula:
          'aspect = { 2: subduction interface ; 1.5: continental normal ; 5: strike-slip ; 3: continental reverse / default }',
        description:
          'Calibrated against published rupture footprints — Tōhoku 2011 (≈ 700×300 km), Sumatra 2004 (≈ 1 600×200 km) and Cascadia models (~1 100×100 km) anchor the L/W ≈ 2 megathrust value (Strasser 2010 SRL 81: 941). Continental-reverse L/W ≈ 3 follows Wells & Coppersmith 1994 Table 2A. Normal-fault events (L′Aquila 2009 ≈ 18×12 km, Amatrice 2016 ≈ 25×17 km) sit at L/W ≈ 1.5. Strike-slip ruptures elongate further, L/W ≈ 5 (Kunlun 2001 ≈ 400×60 km). Replaces the previous single megathrust-style aspect of 3.',
        citation: strasser2010,
      },
      {
        id: 'dip-dependent-uplift',
        name: 'Dip-dependent uplift factor',
        formula:
          'upliftFactor = { 0.6: subduction interface ; 0.5: continental reverse / default ; 0.4: continental normal ; 0.05: strike-slip }',
        description:
          'Ratio of mean seafloor uplift to mean coseismic slip, derived from the Okada 1992 BSSA half-space dislocation projected onto a horizontal sea floor. The shallow-dipping megathrust interface (10–15°) lifts the widest footprint and adds the Tanioka & Satake 1996 horizontal-displacement contribution from sloping bathymetry → 0.6. Mid-dip continental thrusts (~30°) sit at the canonical 0.5; high-dip normal faults (~50°) rotate more slip into horizontal motion → 0.4. Strike-slip events have only residual vertical motion → 0.05 (and the auto-trigger excludes them anyway). Geist & Bilek 2001 motivate the depth-dependent shear-modulus correction implicit in the megathrust value.',
        citation: taniokaSatake1996,
      },
      {
        id: 'wave-coupling-efficiency',
        name: 'Uplift → wave-amplitude efficiency',
        formula: 'A₀ = η · uplift,   η ≈ 0.7',
        description:
          "Empirical efficiency factor for the conversion of seafloor uplift into a long-wavelength gravity-wave amplitude at the source. The textbook approach `A₀ = uplift` implicitly assumes 100 % conversion; in reality only ≈ 70 % of the uplift volume ends up in the propagating long wave — the remainder is dissipated as acoustic waves inside the water column, short-wavelength surface modes that disperse rapidly, and the seafloor's elastic rebound. Satake 2013 BSSA 103: 1473 (Tōhoku 2011 DART-buoy inversion) gives 70 ± 10 % effective coupling. Replaces the previous implicit 100 % assumption.",
        citation: satake2013,
      },
      {
        id: 'submarine-tsunami-trigger',
        name: 'Submarine earthquake auto-trigger',
        formula: 'tsunami fires if waterDepth > 0 AND Mw ≥ 6.5 AND faultType ∈ {reverse, normal}',
        description:
          "Bryant 2014 §3.4 dip-slip uplift rule: the seismic tsunami pipeline fires automatically when the earthquake's epicentre lies on the seafloor and the rupture has a vertical-displacement component, regardless of the explicit `subductionInterface` flag. The full fault-style-aware physics (aspect, uplift factor, wave-coupling efficiency) now flows through every submarine event — including custom-parameter scenarios — so a normal fault on the seafloor produces a smaller wave than a megathrust of the same Mw, as observed.",
        citation: bryant2014,
      },
    ],
  },
  {
    id: 'volcano',
    title: 'Volcanic eruptions',
    blurb:
      'Plinian / sub-Plinian eruptions driven by volume eruption rate and total ejecta volume. Outputs include plume height, VEI, pyroclastic runout (two models), climate cooling, ashfall footprint, and optional lahar runout.',
    entries: [
      {
        id: 'plume-height',
        name: 'Plinian plume height',
        formula: 'H (km) = 2.00 · V̇^0.241     (V̇ in m³/s)',
        description:
          'Mastin 2009 Eq. 1. Published ±factor-2 scatter; the simulator honours that band in its tests.',
        citation: mastin2009,
      },
      {
        id: 'vei',
        name: 'Volcanic Explosivity Index',
        formula: 'VEI = integer bin on log₁₀(V_ejecta)     (V in m³)',
        description:
          'Newhall & Self 1982 eight-level classification, from VEI 0 (non-explosive) to VEI 8 (supereruption).',
        citation: newhallSelf1982,
      },
      {
        id: 'pdc-sheridan',
        name: 'Pyroclastic runout (Sheridan)',
        formula: 'L = 10 · V_km3^(1/3)   km    (H/L ≈ 0.1)',
        description: 'Statistical median mobility for PDCs, retained as a conservative baseline.',
        citation: {
          authors: 'Sheridan, M. F.',
          year: 1979,
          title: 'Emplacement of pyroclastic flows: A review',
          venue: 'Geological Society of America Special Paper 180, 125–136',
        },
      },
      {
        id: 'pdc-energy-line',
        name: 'PDC runout (energy line)',
        formula: 'L = H_plume / slope     (slope ≈ 0.10 for dense flows)',
        description:
          'Dade & Huppert 1998 energy-line upper bound; the runout decreases along an effective H/L energy gradient.',
        citation: dadeHuppert1998,
      },
      {
        id: 'climate-cooling',
        name: 'Climate cooling from VEI',
        formula: 'ΔT(VEI) ≈ −0.03 · 2^(VEI − 3)   K',
        description:
          'Power-law fit against El Chichón / Pinatubo / Tambora anomalies (Robock 2000 dataset review).',
        citation: robock2000,
      },
      {
        id: 'ashfall',
        name: 'Ashfall 1-mm isopach area',
        formula: 'Area(1 mm) ≈ 3 000 · V_km3^0.8   km²',
        description:
          'Simplified Walker 1980 / Pyle 1989 exponential-thinning fit. Wind-independent envelope.',
        citation: {
          authors: 'Pyle, D. M.',
          year: 1989,
          title: 'The thickness, volume and grainsize of tephra fall deposits',
          venue: 'Bulletin of Volcanology 51 (1), 1–15',
          doi: '10.1007/BF01086757',
        },
      },
      {
        id: 'lahar',
        name: 'Lahar runout (Iverson / Vallance)',
        formula: 'L_km ≈ 0.05 · V_m³^0.38',
        description:
          'Iverson 1997 debris-flow volume-runout scaling; reproduces Mt St Helens 1980 within a factor of 2.',
        citation: iverson1997,
      },
      {
        id: 'ashfall-suzuki',
        name: 'Wind-advected ashfall (Suzuki column)',
        formula: 'f(z̃) = A · [(1 − z̃) · exp(λ·(z̃ − 1))]^k   ;   x_centre = u · z / v_t',
        description:
          'Suzuki 1983 vertical release-height distribution along the plume column (λ = 4, k = 1 per Bonadonna & Phillips 2003). Each mass-slice advects downwind at u · t_fall; the isopach elongates with wind speed while σ_x stays set by the source column and σ_y grows with Pasquill-Gifford turbulent diffusion.',
        citation: suzuki1983,
      },
      {
        id: 'ashfall-bonadonna',
        name: 'Analytical advection-diffusion sedimentation',
        formula: 'σ_y(x) = σ_y0 · √(1 + x / L_diff)   ;  L_diff ≈ 10·H',
        description:
          'Bonadonna & Phillips 2003 analytical closure for Plinian fallout. Deposit thickness at (x, y) integrates the Suzuki release weights × Gaussian cross-sections × grain-class mass fractions. Not a full ATM — for hazard mapping use HYSPLIT / FALL3D.',
        citation: bonadonnaPhillips2003,
      },
      {
        id: 'ganser-drag',
        name: 'Terminal velocity (Ganser drag)',
        formula:
          'C_d = (24/Re)·(1 + 0.1118·Re^0.6567) + 0.4305 / (1 + 3305/Re) ;  v_t = √(4·g·d·Δρ / (3·C_d·ρ_a))',
        description:
          'Ganser 1993 rational drag prediction covering Stokes → Newton regimes with one continuous formula. 8-iteration fixed point for the Re-dependent C_d. Applied here to 4 grain classes (32 µm → 8 mm) with the Pyle 1989 mass-fraction spectrum.',
        citation: ganser1993,
      },
      {
        id: 'lateral-blast-wedge',
        name: 'Flank lateral-blast envelope',
        formula:
          'directionDeg, sectorAngleDeg, runout = 0.4 · plumeHeight     (Glicken 1996 § Mt St Helens)',
        description:
          'Mt St Helens 1980 archetype: flank decompression releases a directional jet of pressurised gas + debris that flattens forests across a 180° sector for tens of km along the failure axis. The simulator paints a magenta-pink wedge at the user-specified azimuth + sector angle; runout scales with plume height as a first-order proxy for the blast energy.',
        citation: glicken1996,
      },
      {
        id: 'flank-collapse-tsunami',
        name: 'Volcano flank-collapse tsunami',
        formula: 'A₀ ≈ 0.1 · V^(1/3) · sin(θ),  travelTime = r / √(g · h)',
        description:
          'Watts 2000 solid-block submarine-landslide approximation, applied to volcano flank collapses entering the sea. For the Anak Krakatau 22 December 2018 event (V ≈ 0.27 km³, θ ≈ 20°, h ≈ 200 m) it reproduces the observed ≈ 85 m source amplitude. Grilli 2019 published a full 3D BEM simulation of the same event used here as cross-validation.',
        citation: grilli2019,
      },
    ],
  },
  {
    id: 'tsunami',
    title: 'Tsunami propagation',
    blurb:
      'Long-wave propagation shared by impact, seismic, and landslide-generated tsunamis. Modules include classical far-field decay, hydrocode damping, run-up, submarine-landslide sources, and dispersion.',
    entries: [
      {
        id: 'celerity',
        name: 'Long-wave celerity',
        formula: 'c = √(g · h)',
        description:
          'Shallow-water gravity-wave speed (Lamb 1932 §170). Drives the tsunami-travel-time calculation.',
        citation: {
          authors: 'Lamb, H.',
          year: 1932,
          title: 'Hydrodynamics (6th ed.), §170',
          venue: 'Cambridge University Press',
        },
      },
      {
        id: 'shoaling',
        name: "Green's law shoaling",
        formula: 'A_shore / A_deep = (h_deep / h_shallow)^(1/4)',
        description:
          'Amplification as a long wave climbs onto a shelf; a 1 m deep-ocean wave steepens to ~4 m at h=15 m.',
        citation: {
          authors: 'Green, G.',
          year: 1838,
          title: 'On the motion of waves in a variable canal',
          venue: 'Transactions of the Cambridge Philosophical Society 6, 457–462',
        },
      },
      {
        id: 'synolakis-runup',
        name: 'Plane-beach run-up (Synolakis)',
        formula: 'R_max = 2.831 · H · √(cot β) · (H / d)^(1/4)',
        description: 'Coastal-inundation height for a solitary long wave on a plane slope β.',
        citation: synolakis1987,
      },
      {
        id: 'submarine-landslide',
        name: 'Submarine-landslide source',
        formula: 'A₀ ≈ 0.1 · V^(1/3) · sin(θ)     (V in m³, θ slope angle)',
        description:
          'Watts 2000 solid-block approximation; reproduces the Aitape-PNG 1998 observed run-up within a factor of 2.',
        citation: watts2000,
      },
      {
        id: 'dispersion',
        name: 'Far-field dispersion',
        formula: 'f_disp(r) = exp(−r / 2 500 km)',
        description:
          'Heidarzadeh & Satake 2015 empirical fit against DART-buoy records from Sumatra 2004 and Tōhoku 2011.',
        citation: heidarzadehSatake2015,
      },
      {
        id: 'fast-marching',
        name: 'Bathymetric arrival field (Fast Marching)',
        formula: '|∇T|² = 1 / c(x, y)²   ;   c = √(g · h(x, y))',
        description:
          'Sethian 1996 eikonal solver run on a DEM raster to produce true arrival-time isochrones. The tsunami slows onto continental shelves, refracts around islands, and is blocked by dry coastlines — producing the bent-contour maps NOAA WC/ATWC publishes for tsunami bulletins. Activates whenever a bathymetric grid is loaded; otherwise the uniform-depth Lamb 1932 travel-time falls back.',
        citation: sethian1996,
      },
      {
        id: 'tsunami-source-wavelength',
        name: 'Source-radiated wavelength',
        formula:
          'λ_cavity ≈ 2 · R_C   (impact / explosion);   λ_seismic ≈ 2 · L_rupture   (megathrust)',
        description:
          'Dominant Fourier mode of the source. Cavity-collapse waves carry λ ≈ 2 cavity diameters; finite line-source megathrusts carry λ ≈ 2 rupture lengths. For Tōhoku 2011 (L = 700 km) this gives λ ≈ 1 400 km, matching the dominant component observed at DART buoys (Satake et al. 2013).',
        citation: lamb1932,
      },
      {
        id: 'tsunami-period',
        name: 'Dominant wave period',
        formula: 'T = λ / c',
        description:
          'Period at the source. Tōhoku 2011 (λ ≈ 1 400 km, c ≈ 198 m/s) gives T ≈ 7 000 s ≈ 2 h, consistent with the 30 min – 2 h range reported at coastal tide gauges.',
        citation: lamb1932,
      },
      {
        id: 'inundation-distance',
        name: 'Inland inundation distance',
        formula: 'L_inland = R_runup / tan(β_beach)',
        description:
          'Geometric horizontal reach of the run-up wedge. On the textbook 1:100 reference beach this is 100× the run-up height; on a steep 1:30 dune face only 30×, on a gentle 1:300 mud-flat 300×. FEMA 55 §3.4 / Murata 2010 use the same envelope for first-order coastal hazard mapping. Order-of-magnitude only — site-specific topography, vegetation roughness and back-bay refraction can multiply or divide this by a factor of two on real coasts.',
        citation: fema55,
      },
      {
        id: 'coastal-damage-tier',
        name: 'Coastal damage from run-up height',
        formula:
          'Tier 0: < 0.3 m — tide-gauge only;  Tier 1: 0.3–1 m — light flooding;  Tier 2: 1–3 m — cars / single-storey;  Tier 3: 3–6 m — wood frames / harbours;  Tier 4: 6–10 m — concrete damaged;  Tier 5: > 10 m — Tōhoku-/Lituya-class destruction',
        description:
          'Six-tier damage assessment surfaced in the report panel under every run-up row. Boundaries from Bryant 2014 §10.5, FEMA P-646 §3 and the Imamura tsunami-intensity scale used in JMA / IUGG warnings.',
        citation: bryant2014,
      },
      {
        id: 'beach-slope-from-dem',
        name: 'Beach slope from on-site DEM',
        formula: 'β_beach = atan(|∇z(x, y)|)   when click on land AND atan(1/1000) ≤ β ≤ atan(1/3)',
        description:
          'When the user clicks a coastal cell with a real terrain gradient, the simulator samples the AWS Terrarium DEM tile around the click and feeds the local slope into the Synolakis (1987) run-up. Outside the [1:1000, 1:3] envelope (mud-flat / cliff face) the formula falls back to the 1:100 textbook reference. The result blob carries `beachSlopeRadUsed` and `beachSlopeFromDEM` so the UI can label the run-up as "DEM locale" or "1:100 riferimento".',
        citation: synolakis1987,
      },
    ],
  },
  {
    id: 'population',
    title: 'Population exposure',
    blurb:
      'Cross-event overlay: how many people sit inside the headline damage circle of any scenario? Backed by client-side Cloud-Optimised GeoTIFF lookups against WorldPop or JRC GHSL — no shipped raster. The figure is exposure, not casualties.',
    entries: [
      {
        id: 'population-exposure-overlay',
        name: 'Population exposed inside damage radius',
        formula: 'exposed = Σ population(x, y) · 𝟙[(x − x_0)² + (y − y_0)² ≤ r²]',
        description:
          'Sum of population-grid cells inside the headline damage circle. The browser fetches a Cloud-Optimised GeoTIFF via HTTP Range requests so only the bytes covering the damage bounding box come over the wire — no full raster ever ships. Currently backed by the WorldPop 2020 1 km mosaic (Tatem 2017); the JRC GHSL R2023A grid (Schiavina 2023) is the recommended CORS-enabled alternative when configured via `VITE_POPULATION_COG_URL`.',
        citation: tatem2017,
      },
      {
        id: 'population-vulnerability-disclaimer',
        name: 'Exposure ≠ casualties',
        formula: '(intentionally not implemented)',
        description:
          'The simulator deliberately stops at the population-exposure figure and does NOT convert it to a casualty count. Doing so would need a per-hazard vulnerability function — Glasstone & Dolan §12 lethality bands for blast, Wald & Quitoriano (1999) PAGER fragility curves for shaking — each with documented ±factor-2 scatter at the relevant magnitudes. Exposing a precise fatality figure built on top of those scatters would be the "neal.fun rainbow numbers" effect we explicitly want to avoid; the UI labels every population row as "esposti / exposed" so a reader knows the figure is the population sum, not the death toll.',
        citation: schiavina2023,
      },
    ],
  },
  {
    id: 'monteCarlo',
    title: 'Uncertainty quantification (Monte Carlo)',
    blurb:
      'The "Run Monte Carlo" button re-runs the Layer-2 pipeline a few hundred times, sampling the known-uncertain inputs from distributions published alongside the underlying formulas. The resulting P10/P50/P90 bands are the honest way to present the factor-2 scatter that lives in the plume-height, firestorm-threshold, and liquefaction-radius literature.',
    entries: [
      {
        id: 'mulberry32',
        name: 'Deterministic seeded PRNG',
        formula: 'a ← a + 0x6d2b79f5;  t ← Math.imul(a ^ (a ≫ 15), a | 1); …',
        description:
          'Mulberry32 counter-based generator: 32-bit state, period 2³², high-quality output for a few million samples. Same seed ⇒ same percentiles, so an MC run is fully reproducible from the scenario URL.',
        citation: {
          authors: 'Termine, T. (as popularised by Bryc 2017 in the stdlib PRNG community)',
          year: 2017,
          title: 'Mulberry32 — a simple, high-quality 32-bit PRNG for JavaScript',
          venue: 'GitHub gist / documented in V8 engineering-blog discussions',
        },
      },
      {
        id: 'boxMuller',
        name: 'Normal / log-normal deviate',
        formula: 'z = √(−2 ln u) · cos(2π v)   (Box–Muller polar form)',
        description:
          'Box & Muller 1958 polar transform — two uniform deviates → one unit-normal deviate. Log-normal samples via exp(μ + σ · z) cover the factor-k scatter seen in Mastin 2009 plumes, Popova 2011 meteoroid strengths, and Iverson 1997 lahar runouts.',
        citation: {
          authors: 'Box, G. E. P. & Muller, M. E.',
          year: 1958,
          title: 'A note on the generation of random normal deviates',
          venue: 'Annals of Mathematical Statistics 29 (2), 610–611',
        },
      },
      {
        id: 'sin-weighted-angle',
        name: 'Random-impact angle distribution',
        formula: 'p(θ) dθ = sin(2θ) dθ   ;   θ = arcsin(√u)',
        description:
          'Melosh 1989 Ch. 5 — the canonical distribution of impact angles for randomly-incoming impactors on a flat surface. Peaks at 45°, under-weights both grazing and vertical incidence.',
        citation: melosh1989,
      },
      {
        id: 'percentile-band',
        name: 'Unweighted sample percentiles',
        formula: 'P_n = sort(samples)[⌊n · N / 100⌋]',
        description:
          'Simple order-statistic percentile estimator — sufficient at N ≥ 100 samples, where variance-weighted estimators offer no material gain. We render P10/P50/P90 rather than mean±σ because the underlying distributions are often log-normal (asymmetric band is more honest than ±σ).',
        citation: {
          authors: 'Koonin, S. E.',
          year: 1986,
          title: 'Computational Physics (Ch. 7 — Monte Carlo methods)',
          venue: 'Addison-Wesley',
        },
      },
    ],
  },
];

/**
 * Keyed registry of every citation used in the methodology page.
 * Consumed by the per-scenario Simulation Report, which filters this
 * map against the code paths actually triggered by a given run — so
 * an airburst run cites Chyba+Popova but not Longmire or Iverson.
 */
export const CITATIONS = {
  collins2005,
  chyba1993,
  popova2013,
  teanby2011,
  mcgetchin1973,
  ward2000,
  wunnemann2007,
  toon1997,
  prinn1987,
  brittConsolmagno2003,
  glasstoneDolan1977,
  kinneyGraham1985,
  nordyke1977,
  needham2018,
  longmire1978,
  hanksKanamori1979,
  wellsCoppersmith1994,
  strasser2010,
  joynerBoore1981,
  boore2014,
  faenzaMichelini2010,
  worden2012,
  youdIdriss2001,
  mastin2009,
  newhallSelf1982,
  dadeHuppert1998,
  robock2000,
  iverson1997,
  synolakis1987,
  watts2000,
  heidarzadehSatake2015,
  pike1980,
  suzuki1983,
  bonadonnaPhillips2003,
  ganser1993,
  waldAllen2007,
  sethian1996,
  melosh1989,
  whitham1974,
  sachs1944,
  korobeinikov1991,
  ussa1976,
  brown2013,
  reVelle1976,
  reasenbergJones1989,
  bath1965,
  gutenbergRichter1954,
  utsu1961,
  okada1992,
  lamb1932,
  bryant2014,
  imamura2009,
  femaP646,
  fema55,
  leMehauteWang1996,
  glicken1996,
  grilli2019,
  schultzAnderson1996,
  boslough2008,
  tatem2017,
  schiavina2023,
  geistBilek2001,
  taniokaSatake1996,
  satake2013,
} as const;

export type CitationKey = keyof typeof CITATIONS;

export interface ValidationEntry {
  event: string;
  year: number;
  note: string;
}

export const VALIDATION_ROSTER: ValidationEntry[] = [
  // ─── Cosmic impacts ─────────────────────────────────────────────
  {
    event: 'Chicxulub',
    year: -66_000_000,
    note: 'Morgan et al. 2016 — 180 km rim, K-Pg extinction',
  },
  { event: 'Popigai', year: -35_700_000, note: 'Tagle & Hecht 2006 — 100 km Siberian crater' },
  {
    event: 'Boltysh',
    year: -65_400_000,
    note: 'Kelley & Gurov 2002 — 24 km, contemporaneous with Chicxulub',
  },
  { event: 'Meteor Crater', year: -50_000, note: 'Kring 2007 — iron impactor, 1.2 km crater' },
  { event: 'Tunguska', year: 1908, note: 'Boslough & Crawford 2008 — partial airburst ~8 km' },
  {
    event: 'Sikhote-Alin',
    year: 1947,
    note: 'Krinov 1966 — largest iron-meteorite shower on instrumental record',
  },
  {
    event: 'Chelyabinsk',
    year: 2013,
    note: 'Popova et al. 2013 / Brown et al. 2013 — burst 27 km, 0.44 Mt, 120 km window-breakage',
  },
  // ─── Explosions ─────────────────────────────────────────────────
  {
    event: 'Halifax',
    year: 1917,
    note: 'Bird & MacDonald 2001 — 2.9 kt SS Mont-Blanc cargo, largest pre-nuclear accident',
  },
  { event: 'Hiroshima', year: 1945, note: 'Airburst 580 m, 15 kt (Little Boy)' },
  { event: 'Nagasaki', year: 1945, note: 'Airburst 503 m, 21 kt (Fat Man)' },
  { event: 'Texas City', year: 1947, note: 'Marsh 2010 — 2.7 kt SS Grandcamp NH₄NO₃ detonation' },
  {
    event: 'Ivy Mike',
    year: 1952,
    note: 'LASL LA-1854 — first thermonuclear, 10.4 Mt, vapourised Elugelab',
  },
  { event: 'Castle Bravo', year: 1954, note: 'Bikini Atoll thermonuclear surface burst, 15 Mt' },
  { event: 'Tsar Bomba', year: 1961, note: 'Airburst 4 000 m, 50 Mt — largest human detonation' },
  {
    event: 'Starfish Prime',
    year: 1962,
    note: 'HEMP 400 km altitude, Oahu street-lamps at 1 450 km',
  },
  {
    event: 'Beirut port',
    year: 2020,
    note: 'Rigby 2020; Diaz 2021 — 0.5 kt NH₄NO₃ on portside quay',
  },
  // ─── Earthquakes ────────────────────────────────────────────────
  {
    event: 'Lisbon',
    year: 1755,
    note: 'Baptista & Miranda 2009 — Mw 8.7 Atlantic megathrust, trans-oceanic tsunami',
  },
  {
    event: 'Valdivia',
    year: 1960,
    note: 'Cifuentes 1989 — Mw 9.5, largest instrumentally recorded',
  },
  { event: 'Great Alaska', year: 1964, note: 'Plafker 1965 — Mw 9.2 Aleutian megathrust' },
  { event: 'Northridge', year: 1994, note: 'Blind-thrust reverse Mw 6.7, PGA 0.1–0.4 g observed' },
  { event: 'Kokoxili (Kunlun)', year: 2001, note: 'Strike-slip Mw 7.8 with ~400 km rupture' },
  {
    event: 'Sumatra–Andaman',
    year: 2004,
    note: 'Lay et al. 2005 — Mw 9.2 Sunda megathrust, 230 000 fatalities',
  },
  {
    event: "L'Aquila",
    year: 2009,
    note: 'Chiarabba 2009 — Mw 6.3 normal-fault on the Paganica system',
  },
  { event: 'Tōhoku', year: 2011, note: 'Mw 9.1 megathrust with basin-scale tsunami' },
  { event: 'Nepal Gorkha', year: 2015, note: 'Avouac 2015 — Mw 7.8 Main Himalayan Thrust' },
  {
    event: 'Amatrice',
    year: 2016,
    note: 'Chiaraluce 2017 — first main shock of the central-Italy sequence',
  },
  // ─── Volcanoes ──────────────────────────────────────────────────
  {
    event: 'Vesuvius',
    year: 79,
    note: 'Cioni 1992 — type Plinian eruption, buried Pompeii + Herculaneum',
  },
  { event: 'Etna', year: 1669, note: 'Branca 2013 — 5-month flank eruption, lava reached Catania' },
  { event: 'Tambora', year: 1815, note: "VEI 7 'year without a summer' climate event" },
  { event: 'Krakatau', year: 1883, note: 'Sunda Strait VEI 6 paroxysm + caldera-collapse tsunami' },
  {
    event: 'Mount Pelée',
    year: 1902,
    note: 'Lacroix 1904 — type "nuée ardente", Saint-Pierre incinerated',
  },
  {
    event: 'Mount St Helens',
    year: 1980,
    note: 'Cascade-arc VEI 5 lateral blast + Plinian column',
  },
  { event: 'Pinatubo', year: 1991, note: 'Best-instrumented VEI 6 — global ΔT ≈ −0.5 K' },
  {
    event: 'Eyjafjallajökull',
    year: 2010,
    note: 'Gudmundsson 2012 — subglacial eruption, grounded European aviation',
  },
  {
    event: 'Anak Krakatau',
    year: 2018,
    note: 'Grilli 2019 — flank-collapse tsunami, ≈ 0.27 km³ block',
  },
  {
    event: 'Hunga Tonga',
    year: 2022,
    note: 'Carr 2022 — 57 km plume into the mesosphere, global tsunami signal',
  },
  // ─── Submarine landslides ──────────────────────────────────────
  {
    event: 'Storegga slide',
    year: -8200,
    note: 'Norwegian continental margin, ≈ 3 000 km³, trans-Atlantic tsunami',
  },
  {
    event: 'Lituya Bay',
    year: 1958,
    note: 'Walder 2003 — sub-aerial fjord rockfall, 524 m run-up',
  },
  {
    event: 'Vaiont reservoir',
    year: 1963,
    note: 'Genevois & Ghirotti 2005 — 270 Mm³ rockslide, 250 m wave overtopped the dam',
  },
  {
    event: 'Elm rockslide',
    year: 1881,
    note: 'Heim 1932; Hsü 1975 — founding case for long-runout sturzstrom mobility',
  },
];
