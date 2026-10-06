plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.example.floodguard"

    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.example.floodguard"

        minSdk = 26
        targetSdk = 37

        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner =
            "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }

    compileOptions {
        sourceCompatibility =
            JavaVersion.VERSION_11

        targetCompatibility =
            JavaVersion.VERSION_11
    }

    buildFeatures {
        compose = true
    }
}

dependencies {

    implementation(
        platform(
            libs.androidx.compose.bom
        )
    )

    // =========================
    // COMPOSE
    // =========================

    implementation(
        libs.androidx.activity.compose
    )

    implementation(
        libs.androidx.compose.material3
    )

    implementation(
        libs.androidx.compose.ui
    )

    implementation(
        libs.androidx.compose.ui.graphics
    )

    implementation(
        libs.androidx.compose.ui.tooling.preview
    )
    implementation(
        "androidx.datastore:datastore-preferences:1.1.7"
    )


    // =========================
    // ANDROID CORE
    // =========================

    implementation(
        libs.androidx.core.ktx
    )

    implementation(
        libs.androidx.lifecycle.runtime.ktx
    )


    // =========================
    // MATERIAL ICONS
    // =========================

    implementation(
        "androidx.compose.material:material-icons-extended"
    )


    // =========================
    // VIEWMODEL
    // =========================

    implementation(
        "androidx.lifecycle:lifecycle-viewmodel-compose:2.9.3"
    )


    // =========================
    // LIFECYCLE COMPOSE
    // =========================

    implementation(
        "androidx.lifecycle:lifecycle-runtime-compose:2.9.3"
    )


    // =========================
    // NAVIGATION
    // =========================

    implementation(
        "androidx.navigation:navigation-compose:2.9.5"
    )


    // =========================
    // RETROFIT - CALL API
    // =========================

    implementation(
        "com.squareup.retrofit2:retrofit:2.11.0"
    )

    implementation(
        "com.squareup.retrofit2:converter-gson:2.11.0"
    )


    // =========================
    // OKHTTP
    // =========================

    implementation(
        "com.squareup.okhttp3:okhttp:4.12.0"
    )

    implementation(
        "com.squareup.okhttp3:logging-interceptor:4.12.0"
    )


    // =========================
    // DATASTORE - SAVE TOKEN
    // =========================

    implementation(
        "androidx.datastore:datastore-preferences:1.1.7"
    )


    // =========================
    // TEST
    // =========================

    testImplementation(
        libs.junit
    )

    androidTestImplementation(
        platform(
            libs.androidx.compose.bom
        )
    )

    androidTestImplementation(
        libs.androidx.compose.ui.test.junit4
    )

    androidTestImplementation(
        libs.androidx.espresso.core
    )

    androidTestImplementation(
        libs.androidx.junit
    )

    debugImplementation(
        libs.androidx.compose.ui.test.manifest
    )

    debugImplementation(
        libs.androidx.compose.ui.tooling
    )
}