#!/bin/bash -x
# echo $#
# echo $@
# echo "${@: -9}"
## Ex: ./db_init.sh mahindra-tunnel.intellicar.io 22011 lmmintellicar lmmintellicar_admin "Z52DWfsAZIBtnOK" lmmintellicar fmscoresch lmmintellicar_admin Z52DWfsAZIBtnOK
node ./db_init.js ${@: -9} && ./db_create.sh ${@: -9}
node ./db_seed.js $1 $2 $6 $7 $8 $9
