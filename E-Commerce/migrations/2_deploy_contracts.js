var Products = artifacts.require("Products");

module.exports = function(deployer){
    deployer.deploy(Products);
}