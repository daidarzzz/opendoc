# Landing de OpenDoc

Sitio estático sin build ni dependencias. Los archivos están preparados para publicarse desde la carpeta `landing` o copiarse a la raíz de `/docs`.

## Previsualizar

Desde la raíz del repositorio:

```sh
python -m http.server 8000 --directory landing
```

Abre `http://localhost:8000`. La demo funciona sin red. Para Google Fonts y los enlaces de descarga hace falta conexión.

## GitHub Pages

GitHub Pages permite elegir la raíz de una rama o su carpeta `/docs`, no `/landing`. Para publicar estos archivos desde una rama, copia el contenido de `landing` a `/docs` y en **Settings > Pages** elige **Deploy from a branch**, la rama y `/docs`. Si quieres conservar la publicación directamente desde `landing`, configura un workflow de GitHub Actions que despliegue esa carpeta. Las rutas a CSS, JavaScript y assets son relativas y sirven desde una subcarpeta.

## Datos de releases y licencia

La página consulta la API `https://api.github.com/repos/daidarzzz/opendoc/releases/latest` al cargar. Si responde, muestra el tag y enlaza los instaladores reales por extensión, con tamaño cuando GitHub lo proporciona. Si falla, cada botón lleva a la página general de releases. Durante la preparación, la API devolvió 404; por eso la versión y los nombres de los instaladores quedan pendientes de validación desde una respuesta pública válida.

No se encontró un archivo `LICENSE` en el repositorio al preparar esta landing, por lo que el sitio indica «licencia por definir».
