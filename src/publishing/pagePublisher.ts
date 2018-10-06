import * as ko from "knockout";
import * as Utils from "@paperbits/common/utils";
import { IPublisher } from "@paperbits/common/publishing";
import { IRouteHandler } from "@paperbits/common/routing";
import { IPermalinkService } from "@paperbits/common/permalinks";
import { IBlobStorage } from "@paperbits/common/persistence";
import { IPageService, PageContract } from "@paperbits/common/pages";
import { ISiteService, ISettings } from "@paperbits/common/sites";
import { LayoutModelBinder } from "@paperbits/core/layout";
import { LayoutViewModelBinder } from "@paperbits/core/layout/ko";
import { MetaDataSetter } from "@paperbits/common/meta";
import { IMediaService, MediaContract } from "@paperbits/common/media";
import { ISettingsProvider } from "@paperbits/common/configuration";
import { createDocument } from "@paperbits/core/ko/knockout-rendring";


export class PagePublisher implements IPublisher {
    constructor(
        private readonly routeHandler: IRouteHandler,
        private readonly pageService: IPageService,
        private readonly permalinkService: IPermalinkService,
        private readonly siteService: ISiteService,
        private readonly outputBlobStorage: IBlobStorage,
        private readonly layoutModelBinder: LayoutModelBinder,
        private readonly layoutViewModelBinder: LayoutViewModelBinder,
        private readonly mediaService: IMediaService,
        private readonly settingsProvider: ISettingsProvider
    ) {
        this.publish = this.publish.bind(this);
        this.renderPage = this.renderPage.bind(this);
        this.setSiteSettings = this.setSiteSettings.bind(this);
    }

    private async renderPage(page: PageContract, settings: ISettings, iconFile: MediaContract, imageFile: MediaContract): Promise<{ name, bytes }> {
        console.log(`Publishing page ${page.title}...`);

        const pageTemplate = <string>await this.settingsProvider.getSetting("pageTemplate");
        const templateDocument = createDocument(pageTemplate);

        const documentModel = {
            siteSettings: null,
            pageModel: page,
            pageContentModel: {},
            layoutContentModel: {},
            permalink: null
        };

        let resourceUri: string;
        let htmlContent: string;

        const buildContentPromise = new Promise<void>(async (resolve, reject) => {
            const permalink = await this.permalinkService.getPermalinkByKey(page.permalinkKey);

            documentModel.permalink = permalink;
            resourceUri = permalink.uri;

            this.routeHandler.navigateTo(resourceUri);

            const layoutModel = await this.layoutModelBinder.getLayoutModel();
            const viewModel = await this.layoutViewModelBinder.modelToViewModel(layoutModel);

            const element = templateDocument.createElement("div");
            element.innerHTML = `
            <paperbits-intercom></paperbits-intercom>
            <paperbits-gtm></paperbits-gtm>
            <!-- ko if: widgets().length > 0 -->
            <!-- ko foreach: { data: widgets, as: 'widget'  } -->
            <!-- ko widget: widget --><!-- /ko -->
            <!-- /ko -->
            <!-- /ko -->
            <!-- ko if: widgets().length === 0 -->
            Add page or section
            <!-- /ko -->`;

            ko.applyBindings(viewModel, element);

            if (page.ogImagePermalinkKey) {
                imageFile = await this.mediaService.getMediaByPermalinkKey(page.ogImagePermalinkKey);
            }

            setTimeout(() => {
                const layoutElement = templateDocument.documentElement.querySelector("page-document");
                layoutElement.innerHTML = element.innerHTML;

                this.setSiteSettings(templateDocument, settings, iconFile, imageFile, page, resourceUri);

                htmlContent = templateDocument.documentElement.outerHTML;
                resolve();
            }, 10);
        });

        await buildContentPromise;

        const contentBytes = Utils.stringToUnit8Array(htmlContent);

        if (!resourceUri || resourceUri === "/") {
            resourceUri = "/index.html";
        }
        else {
            // if filename has no extension we publish it to a dedicated folder with index.html
            if (!resourceUri.substr((~-resourceUri.lastIndexOf(".") >>> 0) + 2)) {
                resourceUri = `/${resourceUri}/index.html`;
            }
        }

        return { name: resourceUri, bytes: contentBytes };
    }

    public async publish(): Promise<void> {
        const pages = await this.pageService.search("");
        const results = [];
        const settings = await this.siteService.getSiteSettings();

        let iconFile;

        if (settings && settings.site.faviconPermalinkKey) {
            iconFile = await this.mediaService.getMediaByPermalinkKey(settings.site.faviconPermalinkKey);
        }

        let imageFile;

        if (settings && settings.site.ogImagePermalinkKey) {
            imageFile = await this.mediaService.getMediaByPermalinkKey(settings.site.ogImagePermalinkKey);
        }

        // const renderAndUpload = async (page): Promise<void> => {
        //     const pageRenderResult = await this.renderPage(page, settings, iconFile, imageFile);
        //     await this.outputBlobStorage.uploadBlob(pageRenderResult.name, pageRenderResult.bytes);
        // };

        // for (const page of pages) {
        //     results.push(renderAndUpload(page));
        // }

        for (const page of pages) {
            const pageRenderResult = await this.renderPage(page, settings, iconFile, imageFile);
            results.push(this.outputBlobStorage.uploadBlob(`website\\${pageRenderResult.name}`, pageRenderResult.bytes));
        }

        await Promise.all(results);
    }

    public setSiteSettings(templateDocument: Document, settings: ISettings, iconFile: MediaContract, imageFile: MediaContract, page: PageContract, pageUri: string): void {
        if (settings && page) {
            if (iconFile && iconFile.downloadUrl) {
                MetaDataSetter.setFavIcon(iconFile.downloadUrl);
            }

            const ldSettings: any = {
                "@context": "http://www.schema.org",
                "@type": "product"
            };

            const ogMeta = {};
            const twitterMeta = {
                "twitter:card": "summary"
            };

            let documentTitle = settings.site.title;

            if (page.title && pageUri !== "/") {
                documentTitle = `${page.title} | ${settings.site.title}`;
            }

            templateDocument.title = documentTitle;

            if (templateDocument.title) {
                ogMeta["og:title"] = templateDocument.title;
                twitterMeta["twitter:title"] = templateDocument.title;
                ldSettings.name = templateDocument.title;
            }

            if (page.ogType) {
                ogMeta["og:type"] = page.ogType;
            }

            if (pageUri && settings.site.ogUrl) {
                ogMeta["og:url"] = `${settings.site.ogUrl}${pageUri}`;
                twitterMeta["twitter:url"] = `${settings.site.ogUrl}${pageUri}`;
            }

            if (imageFile && imageFile.downloadUrl) {
                ldSettings.image = imageFile.downloadUrl;
                ogMeta["og:image"] = imageFile.downloadUrl;
                twitterMeta["twitter:image"] = imageFile.downloadUrl;
            }

            if (settings.site.description) {
                const description = page.description || settings.site.description;
                ogMeta["og:description"] = description;
                twitterMeta["twitter:description"] = description;
                MetaDataSetter.setDescription(description);
                ldSettings.description = description;
            }

            if (settings.site.ogSiteName) {
                ogMeta["og:site_name"] = settings.site.ogSiteName;
                ldSettings.brand = settings.site.ogSiteName;
            }

            if (settings.site.keywords) {
                MetaDataSetter.setKeywords(page.keywords);
            }

            if (settings.site.author) {
                MetaDataSetter.setAuthor(settings.site.author);
            }

            MetaDataSetter.setMetaObject(ogMeta, "property");
            MetaDataSetter.setMetaObject(twitterMeta, "name");
            MetaDataSetter.setScriptElement(ldSettings, "application/ld+json");
        }
    }
}