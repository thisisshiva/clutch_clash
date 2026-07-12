import { DEFAULT_CAR_ID, getCarDef } from './carCatalog.js';

const STORAGE_KEY = 'cc_selected_car';

export function getSelectedCarId() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return getCarDef(saved).id;
}

export function setSelectedCarId(carId) {
  localStorage.setItem(STORAGE_KEY, getCarDef(carId).id);
}
