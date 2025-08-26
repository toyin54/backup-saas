// worker/src/services/uploadAzure.ts
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient,
} from "@azure/storage-blob";

type AzureBlobCfg =
  | {
      // Option 1: full connection string
      connectionString: string;
      container: string;
    }
  | {
      // Option 2: account creds
      accountName: string;
      accountKey: string;
      container: string;
    }
  | {
      // Option 3: pre-created SAS URL scoped to a container
      // e.g. https://<account>.blob.core.windows.net/<container>?sv=...&ss=b&srt=...
      containerSasUrl: string;
    };

export async function uploadToAzureBlob(
    azureConnecttion : AzureBlobCfg,
    localfilePath : string) : Promise<string>
    {
     
        const fileName = basename(localfilePath);

        const {containerClient , plainUrlBase} = getContainerClient(azureConnecttion)

        try {
           await containerClient.createIfNotExists()
        } catch (error) {
            console.log(error)
        }

        return 'hello';
    }


function getContainerClient(cfg :AzureBlobCfg ) :{
    containerClient : ContainerClient,
    plainUrlBase : string
}{

    if('connectionString' in cfg)
    {   
        const service = BlobServiceClient.fromConnectionString(cfg.connectionString);
        const containerClient = service.getContainerClient(cfg.container);
        const plainUrlBase = stripQuery(containerClient.url)

         return { containerClient, plainUrlBase };
    }

        if('containerSasUrl' in cfg)
    {
        const containerClient = new ContainerClient(cfg.containerSasUrl);
        const plainUrlBase = stripQuery(containerClient.url)
         return { containerClient, plainUrlBase };
    }

    const {accountName , accountKey , container} = cfg;

    const creds = new StorageSharedKeyCredential(accountName , accountKey);
      const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    creds
  );

  const containerClient = service.getContainerClient(container);
  const plainUrlBase = stripQuery(containerClient.url);
  return { containerClient, plainUrlBase };

}

function stripQuery(u: string): string {
  const i = u.indexOf("?");
  return i === -1 ? u : u.slice(0, i);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}