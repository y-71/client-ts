import { defineConfig } from '@openapi-codegen/cli';
import { Context } from '@openapi-codegen/cli/lib/types';
import { addPathParam, generateFetchers, generateSchemaTypes, renameComponent } from '@openapi-codegen/typescript';

export default defineConfig({
  controlPlane: {
    from: {
      source: 'github',
      owner: 'xataio',
      ref: 'main',
      repository: 'xata',
      specPath: 'openapi/bundled/api_xata_io.yaml'
    },
    outputDir: 'packages/client/src/api',
    to: async (context) => {
      const filenamePrefix = 'controlPlane';

      context.openAPIDocument = removeDraftPaths({ openAPIDocument: context.openAPIDocument });

      const { schemasFiles } = await generateSchemaTypes(context, { filenamePrefix });
      await generateFetchers(context, { filenamePrefix, schemasFiles });
    }
  },
  dataPlane: {
    from: {
      source: 'github',
      owner: 'xataio',
      ref: 'main',
      repository: 'xata',
      specPath: 'openapi/bundled/xata_sh.yaml'
    },
    outputDir: 'packages/client/src/api',
    to: async (context) => {
      // TODO: Fix me, allow no filenamePrefix
      const filenamePrefix = 'dataPlane';

      context.openAPIDocument = removeDraftPaths({ openAPIDocument: context.openAPIDocument });

      // Avoid conflict with typescript `Record<>` type helper
      context.openAPIDocument = renameComponent({
        openAPIDocument: context.openAPIDocument,
        from: '#/components/schemas/Record',
        to: '#/components/schemas/XataRecord'
      });

      // Inject path param in all requests (for now, this should be server url variables)
      context.openAPIDocument = addPathParam({
        openAPIDocument: context.openAPIDocument,
        pathParam: 'workspace',
        required: true
      });

      context.openAPIDocument = addPathParam({
        openAPIDocument: context.openAPIDocument,
        pathParam: 'region',
        required: true
      });

      const { schemasFiles } = await generateSchemaTypes(context, { filenamePrefix });
      await generateFetchers(context, { filenamePrefix, schemasFiles });
    }
  }
});

function removeDraftPaths({ openAPIDocument }: { openAPIDocument: Context['openAPIDocument'] }) {
  const paths = Object.fromEntries(
    Object.entries(openAPIDocument.paths).map(([route, verbs]) => {
      const updatedVerbs = Object.entries(verbs).reduce((acc, [verb, operation]) => {
        if (isVerb(verb) && isDraft(operation)) {
          return acc;
        }

        return { ...acc, [verb]: operation };
      }, {});

      return [route, updatedVerbs];
    })
  );

  return { ...openAPIDocument, paths };
}

const isVerb = (verb: string): verb is 'get' | 'post' | 'patch' | 'put' | 'delete' =>
  ['get', 'post', 'patch', 'put', 'delete'].includes(verb);

const isDraft = (operation: unknown) => {
  if (!operation || typeof operation !== 'object') {
    return false;
  }

  return operation['x-draft'] === true;
};
