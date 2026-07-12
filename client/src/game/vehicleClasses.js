/**
 * OOP vehicle model:
 * - AbstractCarDefinition defines shared invariants/shape
 * - Concrete subclasses provide tuned values for each regular car
 */
export class AbstractCarDefinition {
  constructor({
    id,
    name,
    file,
    preview,
    defaultColor,
    targetLength,
    tintStrength,
    stats,
    engine,
  }) {
    if (new.target === AbstractCarDefinition) {
      throw new Error('AbstractCarDefinition cannot be instantiated directly');
    }
    this.id = id;
    this.name = name;
    this.file = file;
    this.preview = preview;
    this.defaultColor = defaultColor;
    this.targetLength = targetLength;
    this.tintStrength = tintStrength;
    this.stats = stats;
    this.engine = engine;
  }

  toCatalogEntry() {
    return {
      id: this.id,
      name: this.name,
      file: this.file,
      preview: this.preview,
      defaultColor: this.defaultColor,
      targetLength: this.targetLength,
      tintStrength: this.tintStrength,
      stats: { ...this.stats },
      engine: { ...this.engine },
    };
  }
}

class SedanCar extends AbstractCarDefinition {
  constructor(base) {
    super({
      id: 'sedan',
      name: 'City Sedan',
      file: `${base}models/cars/sedan.glb`,
      preview: `${base}img/cars/sedan.png`,
      defaultColor: 0x4f6fd8,
      targetLength: 4.6,
      tintStrength: 0.3,
      stats: { speed: 78, power: 68, health: 82, grip: 76, weight: 82, boost: 66 },
      engine: { osc1: 'triangle', osc2: 'sawtooth', baseHz: 34, pitchRange: 95, osc2Ratio: 1.28, volume: 0.13, filterHz: 700 },
    });
  }
}

class SuvCar extends AbstractCarDefinition {
  constructor(base) {
    super({
      id: 'suv',
      name: 'Road SUV',
      file: `${base}models/cars/suv.glb`,
      preview: `${base}img/cars/suv.png`,
      defaultColor: 0x58616c,
      targetLength: 4.9,
      tintStrength: 0.28,
      stats: { speed: 74, power: 76, health: 92, grip: 70, weight: 94, boost: 62 },
      engine: { osc1: 'sawtooth', osc2: 'triangle', baseHz: 30, pitchRange: 84, osc2Ratio: 1.2, volume: 0.16, filterHz: 580 },
    });
  }
}

class TaxiCar extends AbstractCarDefinition {
  constructor(base) {
    super({
      id: 'taxi',
      name: 'Taxi Cab',
      file: `${base}models/cars/taxi.glb`,
      preview: `${base}img/cars/taxi.png`,
      defaultColor: 0xf3b300,
      targetLength: 4.7,
      tintStrength: 0.26,
      stats: { speed: 76, power: 70, health: 84, grip: 74, weight: 86, boost: 64 },
      engine: { osc1: 'triangle', osc2: 'square', baseHz: 33, pitchRange: 88, osc2Ratio: 1.22, volume: 0.14, filterHz: 640 },
    });
  }
}

class VanCar extends AbstractCarDefinition {
  constructor(base) {
    super({
      id: 'van',
      name: 'Cargo Van',
      file: `${base}models/cars/van.glb`,
      preview: `${base}img/cars/van.png`,
      defaultColor: 0x7a7a7a,
      targetLength: 5.1,
      tintStrength: 0.22,
      stats: { speed: 70, power: 72, health: 94, grip: 66, weight: 98, boost: 58 },
      engine: { osc1: 'sawtooth', osc2: 'sawtooth', baseHz: 28, pitchRange: 74, osc2Ratio: 1.18, volume: 0.18, filterHz: 520 },
    });
  }
}

class TruckCar extends AbstractCarDefinition {
  constructor(base) {
    super({
      id: 'truck',
      name: 'Street Truck',
      file: `${base}models/cars/truck.glb`,
      preview: `${base}img/cars/truck.png`,
      defaultColor: 0x3f7a3f,
      targetLength: 5.4,
      tintStrength: 0.2,
      stats: { speed: 66, power: 82, health: 98, grip: 60, weight: 100, boost: 52 },
      engine: { osc1: 'square', osc2: 'sawtooth', baseHz: 25, pitchRange: 68, osc2Ratio: 1.15, volume: 0.2, filterHz: 500 },
    });
  }
}

export function createRegularCarProfiles(base) {
  return [
    new SedanCar(base),
    new SuvCar(base),
    new TaxiCar(base),
    new VanCar(base),
    new TruckCar(base),
  ];
}
