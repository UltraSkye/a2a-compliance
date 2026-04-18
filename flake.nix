{
  description = "a2a-compliance — compliance test kit + security audit for A2A (Agent2Agent) protocol endpoints";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
        pnpm = pkgs.pnpm_10 or pkgs.pnpm;

        # Derivation that builds the workspace and produces the CLI
        # tarball as a runnable bundle. Uses pnpm so workspace deps are
        # resolved the same way the repo's CI does — no npm indirection.
        a2a-compliance-cli = pkgs.stdenv.mkDerivation {
          pname = "a2a-compliance-cli";
          version = (builtins.fromJSON (builtins.readFile ./packages/cli/package.json)).version;
          src = ./.;
          nativeBuildInputs = [ node pnpm pkgs.makeWrapper ];
          buildPhase = ''
            export HOME=$TMPDIR
            pnpm install --frozen-lockfile --filter '@a2a-compliance/cli...'
            pnpm -r --filter=./packages/* build
          '';
          installPhase = ''
            mkdir -p $out/libexec/a2a-compliance
            cp -r packages/schemas/dist  $out/libexec/a2a-compliance/schemas
            cp -r packages/core/dist     $out/libexec/a2a-compliance/core
            cp -r packages/cli/dist      $out/libexec/a2a-compliance/cli
            cp -r node_modules           $out/libexec/a2a-compliance/node_modules
            cp    packages/cli/package.json  $out/libexec/a2a-compliance/cli/package.json
            mkdir -p $out/bin
            makeWrapper ${node}/bin/node $out/bin/a2a-compliance \
              --add-flags "$out/libexec/a2a-compliance/cli/index.js"
          '';
          meta = with pkgs.lib; {
            description = "Compliance test kit + security audit for A2A (Agent2Agent) protocol endpoints";
            homepage    = "https://github.com/UltraSkye/a2a-compliance";
            license     = licenses.mit;
            mainProgram = "a2a-compliance";
            platforms   = platforms.unix;
          };
        };
      in
      {
        packages = {
          default = a2a-compliance-cli;
          a2a-compliance-cli = a2a-compliance-cli;
        };

        # `nix run github:UltraSkye/a2a-compliance -- run https://...`
        apps.default = flake-utils.lib.mkApp { drv = a2a-compliance-cli; };

        # `nix develop` drops into a shell with pnpm + node already on PATH.
        devShells.default = pkgs.mkShell {
          name = "a2a-compliance-dev";
          packages = [ node pnpm pkgs.git pkgs.docker ];
          shellHook = ''
            echo "a2a-compliance dev shell — node $(node --version), pnpm $(pnpm --version)"
          '';
        };
      });
}
