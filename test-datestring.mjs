// Test if 'Hoy' is a valid ISO date
const dateString = 'Hoy';
const dateObj = new Date(dateString);
console.log('Date from "Hoy":', dateObj);
console.log('Is valid:', !isNaN(dateObj.getTime()));
