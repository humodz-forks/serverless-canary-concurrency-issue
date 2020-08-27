// Fixes AWS::Lambda::Permission resources so that they point to
// the aliases created by serverless-plugin-canary-deployments
// instead of the aliases created by provisionedConcurrency

module.exports = class FixPermissionsPlugin {
  constructor(serverless) {
    this.serverless = serverless;
    this.awsProvider = this.serverless.getProvider('aws');
    this.naming = this.awsProvider.naming;

    this.hooks = {
      'before:package:finalize': () => this.fixPermissions(),
    };
  }

  fixPermissions() {
    const functionToAliasMap = this.getAliasesMap();
    const resources = this.compiledTemplate().Resources;

    for (const resource of Object.values(resources)) {
      if (resource.Type === 'AWS::Lambda::Permission') {
        const functionName = resource.Properties.FunctionName;

        if (this.isProvisionedAlias(functionName)) {
          const newFunctionName = this.getCorrectFunctionName(functionName, functionToAliasMap);
          resource.Properties.FunctionName = newFunctionName;
        }
      }
    }
  }

  compiledTemplate() {
    return this.serverless.service.provider.compiledCloudFormationTemplate;
  }

  isProvisionedAlias(functionName) {
    // Checks if functionName looks like this:
    // { "Fn::Join": [":", [functionArn, "provisioned"]] }
    return (
      functionName['Fn::Join'] &&
      functionName['Fn::Join'][0] === ':' &&
      functionName['Fn::Join'][1].length === 2 &&
      functionName['Fn::Join'][1][1] === 'provisioned'
    );
  }

  getCorrectFunctionName(functionName, functionToAliasMap) {
    const functionArn = functionName['Fn::Join'][1][0];
    // functionArn should look like this:
    // { "Fn::GetAtt": [functionResourceName, "Arn"] }
    const functionResourceName = functionArn['Fn::GetAtt'][0];

    const canaryAlias = functionToAliasMap.get(functionResourceName);

    if (!canaryAlias) {
      return functionName;
    }

    return {
      Ref: `${functionResourceName}Alias${canaryAlias}`,
    };
  }

  // Returns Map { function resource name => canary alias }
  getAliasesMap() {
    const functionNames = this.serverless.service.getAllFunctions();

    const result = new Map();

    for (const functionName of functionNames) {
      const props = this.serverless.service.getFunction(functionName);

      const canaryAlias = (() => {
        try {
          return props.deploymentSettings.alias;
        } catch (e) {
          return null;
        }
      })();

      if (canaryAlias) {
        const functionResourceName = this.naming.getLambdaLogicalId(functionName);
        result.set(functionResourceName, canaryAlias);
      }
    }

    return result;
  }
}
