export class AbstractServerCar {
  constructor({ id, stats }) {
    if (new.target === AbstractServerCar) {
      throw new Error('AbstractServerCar cannot be instantiated directly');
    }
    this.id = id;
    this.stats = stats;
  }

  toCatalogEntry() {
    return { id: this.id, stats: { ...this.stats } };
  }
}

class SedanServerCar extends AbstractServerCar {
  constructor() {
    super({ id: 'sedan', stats: { speed: 78, power: 68, health: 82, grip: 76, weight: 82, boost: 66 } });
  }
}

class SuvServerCar extends AbstractServerCar {
  constructor() {
    super({ id: 'suv', stats: { speed: 74, power: 76, health: 92, grip: 70, weight: 94, boost: 62 } });
  }
}

class TaxiServerCar extends AbstractServerCar {
  constructor() {
    super({ id: 'taxi', stats: { speed: 76, power: 70, health: 84, grip: 74, weight: 86, boost: 64 } });
  }
}

class VanServerCar extends AbstractServerCar {
  constructor() {
    super({ id: 'van', stats: { speed: 70, power: 72, health: 94, grip: 66, weight: 98, boost: 58 } });
  }
}

class TruckServerCar extends AbstractServerCar {
  constructor() {
    super({ id: 'truck', stats: { speed: 66, power: 82, health: 98, grip: 60, weight: 100, boost: 52 } });
  }
}

export function createRegularServerCars() {
  return [
    new SedanServerCar(),
    new SuvServerCar(),
    new TaxiServerCar(),
    new VanServerCar(),
    new TruckServerCar(),
  ];
}
