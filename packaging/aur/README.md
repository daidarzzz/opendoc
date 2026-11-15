# AUR (`opendoc-bin`)

`PKGBUILD` es una plantilla: `.github/workflows/aur.yml` la rellena con la
versión y el hash del `.pkg.tar.zst` de la release y la sube al AUR cuando
se **publica** una release (los borradores y las prereleases se ignoran).

## Puesta en marcha (una sola vez)

1. Crea una cuenta en <https://aur.archlinux.org>.
2. Genera una clave solo para esto: `ssh-keygen -t ed25519 -f aur_key -C opendoc-aur`.
3. Pega `aur_key.pub` en tu perfil del AUR (*My Account → SSH Public Key*).
4. En GitHub: *Settings → Secrets and variables → Actions → New repository
   secret*, nombre `AUR_SSH_KEY`, valor el contenido de `aur_key` (privada).
5. Borra la clave privada local. Para publicar la versión actual sin esperar
   a una release nueva: *Actions → AUR → Run workflow* con el tag (`v0.3.1`).

Sin el secreto el workflow termina avisando, sin fallar.
