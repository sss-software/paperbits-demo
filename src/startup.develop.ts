/**
 * @license
 * Copyright Vienna LLC. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://paperbits.io/license.
 */

import "es6-shim";
import "setimmediate";
import * as ko from "knockout";

import { InversifyInjector } from "@paperbits/common/injection";
import { HtmlModule } from "@paperbits/html/html.module";

import { OfflineObjectStorage } from "@paperbits/common/persistence/offlineObjectStorage";
import { AnchorMiddleware } from "@paperbits/common/persistence/anchorMiddleware";
import { CoreModule } from "@paperbits/core/core.module";
import { CoreEditModule } from "@paperbits/core/core.edit.module";
import { FormsEditModule } from "@paperbits/forms/forms.edit.module";

//import { FirebaseModule } from "@paperbits/firebase/firebase.module";
import { DemoModule } from "./components/demo.module";
import { SettingsProvider } from "@paperbits/common/configuration";
import { DefaultRouteHandler } from "@paperbits/common/routing";

document.addEventListener("DOMContentLoaded", () => {
    const injector = new InversifyInjector();

    //injector.bindModule(new FirebaseModule());
    injector.bindModule(new DemoModule("/data/demo.json"));
    injector.bindModule(new HtmlModule());
    injector.bindSingleton("settingsProvider", SettingsProvider);
    injector.bindSingleton("routeHandler", DefaultRouteHandler);
    const coreModule = new CoreModule();
    const coreEditModule = new CoreEditModule();
    injector.bindModule(coreModule);   
    injector.bindModule(coreEditModule);  

    injector.bindModule(new FormsEditModule(coreModule.modelBinders, coreModule.viewModelBinders));  

    /*** Autostart ***/
    injector.resolve("contentBindingHandler");
    injector.resolve("gridBindingHandler");
    injector.resolve("lighboxBindingHandler");
    injector.resolve("draggablesBindingHandler");
    injector.resolve("widgetBindingHandler");
    injector.resolve("hostBindingHandler");
    injector.resolve("htmlEditorBindingHandler");
    injector.resolve("balloonBindingHandler");
    injector.resolve("backgroundBindingHandler");
    injector.resolve("resizableBindingHandler");
    injector.resolve("savingHandler");
    injector.resolve("errorHandler");
    injector.resolve("knockoutValidation");

    const offlineObjectStorage = injector.resolve<OfflineObjectStorage>("offlineObjectStorage");
    const anchorMiddleware = injector.resolve<AnchorMiddleware>("anchorMiddleware");

    offlineObjectStorage.registerMiddleware(anchorMiddleware);

    ko.options["createChildContextWithAs"] = true;
    ko.applyBindings();
});