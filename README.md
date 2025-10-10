Rifa - Sitio estático con Firebase

Esta plantilla crea una web simple para una rifa usando Firestore como backend.

Archivos principales:
- `index.html` - página principal
- `css/styles.css` - estilos
- `js/app.js` - lógica para Firestore y UI

Pasos rápidos:
1. Crea un proyecto en https://console.firebase.google.com/ y añade una web app.
2. Copia la configuración de Firebase y reemplaza `firebaseConfig` en `js/app.js`.
3. (Opcional) Instala y configura Firebase CLI para desplegar en Hosting.

Notas de seguridad:
- Las reglas de Firestore deben restringir escrituras según tu caso. Para pruebas, puedes abrir reglas, pero no lo dejes así en producción.
- Para un sorteo con seguridad/evitabilidad de manipulación, haz el sorteo en el servidor (Cloud Function) y guarda el resultado en Firestore.

Si quieres, puedo:
- Añadir autenticación para limitar participaciones.
- Implementar reglas de Firestore de ejemplo.
- Crear una Cloud Function para sortear de forma segura.
